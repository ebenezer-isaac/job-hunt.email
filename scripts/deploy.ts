import { spawnSync, SpawnSyncOptions } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVICE_NAME = process.env.CLOUD_RUN_SERVICE ?? "job-hunt-email";
const CLOUD_BUILD_FILE = process.env.CLOUD_BUILD_FILE ?? "cloudbuild.yaml";
const ENV_FILE = process.env.DEPLOY_ENV_FILE ?? ".env.build";
const GCLOUD_BIN = process.env.GCLOUD_BIN ?? (process.platform === "win32" ? "gcloud.cmd" : "gcloud");
const USE_SHELL = process.platform === "win32";
const REQUIRED_DEPLOY_KEYS = ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_REPO_URL"];

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
  validateEnv(envMap);

  const tempDir = await prepareTempDir();
  try {
    await syncSecrets(envMap, tempDir);
    await runCloudBuild(envMap);
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
  for (const key of keys) {
    const value = env[key];
    if (value === undefined) {
      throw new Error(`Missing ${key} in ${ENV_FILE}`);
    }
    console.log(`   • checking secret ${key}`);
    ensureSecretExists(key);

    if (shouldUpdateSecret(key, value)) {
      const secretPath = path.join(tempDir, `${key}.txt`);
      await fs.writeFile(secretPath, value, "utf8");
      console.log(`     ↳ uploading new version`);
      runCommand(GCLOUD_BIN, ["secrets", "versions", "add", key, `--data-file=${secretPath}`]);
      await fs.rm(secretPath, { force: true });
    } else {
      console.log(`     ↳ value unchanged, skipping update`);
    }
  }
}

function ensureSecretExists(name: string): void {
  const describe = spawnSync(GCLOUD_BIN, ["secrets", "describe", name], {
    stdio: "ignore",
    shell: USE_SHELL,
  });
  if (describe.status === 0) {
    return;
  }
  console.log(`     ↳ creating secret ${name}`);
  runCommand(GCLOUD_BIN, ["secrets", "create", name, "--replication-policy=automatic"]);
}

function shouldUpdateSecret(name: string, newValue: string): boolean {
  try {
    const result = spawnSync(GCLOUD_BIN, ["secrets", "versions", "access", "latest", `--secret=${name}`], {
      encoding: "utf8",
      shell: USE_SHELL,
      stdio: ["ignore", "pipe", "ignore"], // Suppress stderr (e.g. if no version exists)
    });

    if (result.status !== 0) {
      // Likely no version exists yet
      return true;
    }

    const currentValue = result.stdout.trim();
    // Compare trimmed values to avoid issues with trailing newlines
    return currentValue !== newValue.trim();
  } catch {
    // If any error occurs (e.g. network), assume we need to update to be safe
    return true;
  }
}

async function runCloudBuild(env: EnvMap): Promise<void> {
  console.log("🚀 Running Cloud Build deployment...");
  const tag = createTag();
  const substitutions = [
    `_APP_URL=${env.NEXT_PUBLIC_APP_URL}`,
    `_REPO_URL=${env.NEXT_PUBLIC_REPO_URL}`,
    `_TAG=${tag}`,
  ].join(",");

  runCommand(
    GCLOUD_BIN,
    [
      "builds",
      "submit",
      "--config",
      CLOUD_BUILD_FILE,
      "--substitutions",
      substitutions,
    ],
    { stdio: "inherit" },
  );
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
