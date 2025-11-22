import { spawnSync } from "node:child_process";

const GCLOUD_BIN = process.platform === "win32" ? "gcloud.cmd" : "gcloud";
const USE_SHELL = process.platform === "win32";

function runCommand(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: USE_SHELL,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function main() {
  console.log("🗑️  Fetching list of secrets...");
  const secretsOutput = runCommand(GCLOUD_BIN, ["secrets", "list", "--format=value(name)"]);
  const secrets = secretsOutput.split(/\r?\n/).filter((s) => s.trim().length > 0);

  if (secrets.length === 0) {
    console.log("✅ No secrets found to delete.");
    return;
  }

  console.log(`⚠️  Found ${secrets.length} secrets. Deleting them now...`);

  for (const secret of secrets) {
    console.log(`   ❌ Deleting ${secret}...`);
    try {
      runCommand(GCLOUD_BIN, ["secrets", "delete", secret, "--quiet"]);
    } catch (error) {
      console.error(`      Failed to delete ${secret}:`, error);
    }
  }

  console.log("✅ All secrets deleted.");
}

main();
