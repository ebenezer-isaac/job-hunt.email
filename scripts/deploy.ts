import { spawnSync, SpawnSyncOptions } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVICE_NAME = process.env.CLOUD_RUN_SERVICE ?? "job-hunt-email";
const CLOUD_BUILD_FILE = process.env.CLOUD_BUILD_FILE ?? "infra/cloud-build/cloudbuild.yaml";
const ENV_FILE = process.env.DEPLOY_ENV_FILE ?? ".env.build";
const GCLOUD_BIN = process.env.GCLOUD_BIN ?? (process.platform === "win32" ? "gcloud.cmd" : "gcloud");
const USE_SHELL = process.platform === "win32";
const REQUIRED_DEPLOY_KEYS = ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_REPO_URL"];
const INLINE_ENV_KEYS = new Set([
  "NEXT_PUBLIC_APP_ENV",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_REPO_URL",
  "APP_URL",
  "LOG_LEVEL",
  "NODE_ENV",
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

interface EnvMap {
  [key: string]: string;
}

async function main() {
  console.log("📦 Starting deployment for", SERVICE_NAME);
  const envPath = path.resolve(REPO_ROOT, ENV_FILE);
  const envMap = await parseEnvFile(envPath);
  console.log("🧾 Loaded", Object.keys(envMap).length, "env keys from", ENV_FILE);
  validateEnv(envMap);

  const tempDir = await prepareTempDir();
  try {
    await syncSecrets(envMap, tempDir);
    const secretMappings = buildSecretMappings(envMap);
    const inlineEnvVars = buildInlineEnvVars(envMap);
    console.log("🧩 Inline env var count:", inlineEnvVars.split(",").length);
    console.log("🔑 Secret mapping count:", secretMappings.split(",").length);
    await runCloudBuild(secretMappings, inlineEnvVars);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  console.log("✅ Deployment finished");
}

async function parseEnvFile(filePath: string): Promise<EnvMap> {
  const contents = await fs.readFile(filePath, "utf8");
  return contents
    .split(/\r?\n/)
    .reduce<EnvMap>((acc, rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        return acc;
      }
      const equalsIndex = line.indexOf("=");
      if (equalsIndex === -1) {
        return acc;
      }
      const key = line.slice(0, equalsIndex).trim();
      let value = line.slice(equalsIndex + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      acc[key] = value;
      return acc;
    }, {});
}

function validateEnv(env: EnvMap): void {
  if (Object.keys(env).length === 0) {
    throw new Error(`${ENV_FILE} is empty—populate it with production values first.`);
  }
  REQUIRED_DEPLOY_KEYS.forEach((key) => {
    if (!env[key]) {
      throw new Error(`Missing ${key} in ${ENV_FILE}`);
    }
  });
}

async function prepareTempDir(): Promise<string> {
  const tmpRoot = path.join(REPO_ROOT, "tmp");
  await fs.mkdir(tmpRoot, { recursive: true });
  return fs.mkdtemp(path.join(tmpRoot, "deploy-"));
}

async function syncSecrets(env: EnvMap, tempDir: string): Promise<void> {
  console.log("🔐 Syncing secrets to Secret Manager...");
  const keys = Object.keys(env);
  const existingSecrets = listExistingSecrets();
  const keysWithSecrets = keys.filter((key) => existingSecrets.has(key));
  const remoteValues = fetchLatestSecretValues(keysWithSecrets);

  for (const key of keys) {
    const value = env[key];
    if (value === undefined) {
      throw new Error(`Missing ${key} in ${ENV_FILE}`);
    }
    console.log(`   • checking secret ${key}`);

    if (!existingSecrets.has(key)) {
      console.log(`     ↳ creating secret ${key}`);
      createSecret(key);
      existingSecrets.add(key);
      await uploadSecretVersion(key, value, tempDir);
      continue;
    }

    const currentValue = remoteValues.get(key);
    if (currentValue === undefined || !valuesMatch(currentValue, value)) {
      console.log(`     ↳ uploading new version`);
      await uploadSecretVersion(key, value, tempDir);
    } else {
      console.log(`     ↳ value unchanged, skipping update`);
    }
  }
}

function listExistingSecrets(): Set<string> {
  const raw = runCommand(GCLOUD_BIN, ["secrets", "list", "--format=json(name)", "--limit=10000"]);
  if (!raw.trim()) {
    return new Set();
  }
  try {
    const parsed = JSON.parse(raw) as Array<{ name: string }>;
    return new Set(parsed.map((entry) => entry.name.split("/").pop() ?? entry.name));
  } catch (error) {
    throw new Error(`Unable to parse secret list: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fetchLatestSecretValues(names: string[]): Map<string, string> {
  return names.reduce<Map<string, string>>((acc, name) => {
    const value = accessSecretValue(name);
    if (value !== undefined) {
      acc.set(name, value);
    }
    return acc;
  }, new Map());
}

function accessSecretValue(name: string): string | undefined {
  const result = spawnSync(GCLOUD_BIN, ["secrets", "versions", "access", "latest", `--secret=${name}`], {
    encoding: "utf8",
    shell: USE_SHELL,
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    return undefined;
  }
  return typeof result.stdout === "string" ? result.stdout.trim() : undefined;
}

function createSecret(name: string): void {
  runCommand(GCLOUD_BIN, ["secrets", "create", name, "--replication-policy=automatic"]);
}

async function uploadSecretVersion(name: string, value: string, tempDir: string): Promise<void> {
  const secretPath = path.join(tempDir, `${name}.txt`);
  await fs.writeFile(secretPath, value, "utf8");
  runCommand(GCLOUD_BIN, ["secrets", "versions", "add", name, `--data-file=${secretPath}`]);
  await fs.rm(secretPath, { force: true });
}

function valuesMatch(remote: string, local: string): boolean {
  return normalizeValue(remote) === normalizeValue(local);
}

function normalizeValue(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

const RESERVED_KEYS = new Set([
  "PORT",
  "K_SERVICE",
  "K_REVISION",
  "K_CONFIGURATION",
  "GOOGLE_CLOUD_PROJECT",
]);

function buildSecretMappings(env: EnvMap): string {
  const secretKeys = Object.keys(env)
    .filter((key) => !INLINE_ENV_KEYS.has(key) && !RESERVED_KEYS.has(key))
    .sort();
  if (secretKeys.length === 0) {
    throw new Error("No secret mappings derived from env file — ensure .env.build contains at least one secret.");
  }
  console.log("🔍 Secret keys:", secretKeys);
  return secretKeys.map((key) => `${key}=${key}:latest`).join(",");
}

function buildInlineEnvVars(env: EnvMap): string {
  const inlinePairs = Array.from(INLINE_ENV_KEYS)
    .filter((key) => env[key] !== undefined && env[key] !== "")
    .sort()
    .map((key) => `${key}=${env[key]}`);
  if (inlinePairs.length === 0) {
    throw new Error("No inline env vars derived from env file — ensure .env.build defines at least one inline key.");
  }
  console.log("🧠 Inline env keys:", inlinePairs.map((pair) => pair.split("=")[0]));
  return inlinePairs.join(",");
}

async function runCloudBuild(secretMappings: string, inlineEnvVars: string): Promise<void> {
  console.log("🚀 Running Cloud Build deployment...");
  const tag = createTag();

  // Read the template
  const cloudBuildPath = path.resolve(REPO_ROOT, CLOUD_BUILD_FILE);
  let cloudBuildContent = await fs.readFile(cloudBuildPath, "utf8");

  // Inject arguments
  const injection = [
    `      - "--set-env-vars"`,
    `      - "${inlineEnvVars}"`,
    `      - "--set-secrets"`,
    `      - "${secretMappings}"`,
  ].join("\n");

  cloudBuildContent = cloudBuildContent.replace("      # __DYNAMIC_ARGUMENTS__", injection);

  // Write temporary build file
  const tempBuildFile = path.resolve(REPO_ROOT, "cloudbuild.tmp.yaml");
  await fs.writeFile(tempBuildFile, cloudBuildContent, "utf8");

  try {
    runCommand(
      GCLOUD_BIN,
      [
        "builds",
        "submit",
        "--config",
        tempBuildFile,
        "--substitutions",
        `_TAG=${tag}`,
      ],
      { stdio: "inherit" },
    );
  } finally {
    await fs.rm(tempBuildFile, { force: true });
  }
}

function createTag(): string {
  const gitSha = runCommand("git", ["rev-parse", "--short", "HEAD"]).trim();
  const now = new Date();
  const timestamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `${gitSha}-${timestamp}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function runCommand(command: string, args: string[], options: SpawnSyncOptions = {}): string {
  const result = spawnSync(command, args, {
    stdio: options.stdio ?? "pipe",
    encoding: "utf8",
    shell: USE_SHELL,
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}`);
  }
  return typeof result.stdout === "string" ? result.stdout : "";
}

main().catch((error) => {
  console.error("❌ Deployment failed");
  console.error(error);
  process.exit(1);
});
