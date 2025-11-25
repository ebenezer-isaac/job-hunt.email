import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const ENV_SOURCE = path.join(PROJECT_ROOT, ".env.build");
const CLEAN_ENV_PATH = path.join(PROJECT_ROOT, ".env.build.clean");
const TMP_DIR = path.join(PROJECT_ROOT, "tmp");
const SECRETS_DIR = path.join(TMP_DIR, "secrets");
const REPORT_PATH = path.join(TMP_DIR, "secrets-report.json");
const UPLOAD_SCRIPT_PATH = path.join(TMP_DIR, "upload-secrets.ps1");

if (!fs.existsSync(ENV_SOURCE)) {
  console.error(`✖ Cannot find ${ENV_SOURCE}.`);
  process.exit(1);
}

const ZERO_WIDTH = new Set(["\u200B", "\u200C", "\u200D", "\u2060", "\uFEFF"]);

function stripHiddenCharacters(value: string) {
  let cleaned = "";
  const hidden: string[] = [];
  for (const char of value) {
    if (ZERO_WIDTH.has(char)) {
      hidden.push(`U+${char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}`);
      continue;
    }
    cleaned += char;
  }
  return { cleaned, hidden };
}

type Entry = {
  key: string;
  value: string;
  line: number;
  hidden: string[];
};

const fileContent = fs.readFileSync(ENV_SOURCE, "utf8");
const lines = fileContent.split(/\r?\n/);
const entries = new Map<string, Entry>();
const duplicates: Array<{ key: string; previousLine: number; currentLine: number }> = [];
const problems: string[] = [];

lines.forEach((rawLine, index) => {
  const lineNumber = index + 1;
  if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
    return;
  }

  const eqIndex = rawLine.indexOf("=");
  if (eqIndex === -1) {
    problems.push(`Line ${lineNumber} is missing '=': ${rawLine}`);
    return;
  }

  const rawKey = rawLine.slice(0, eqIndex);
  const rawValue = rawLine.slice(eqIndex + 1);

  const { cleaned: cleanedKey, hidden: hiddenKeyChars } = stripHiddenCharacters(rawKey);
  const key = cleanedKey.trim();
  const { cleaned: cleanedValue, hidden: hiddenValueChars } = stripHiddenCharacters(rawValue);
  let value = cleanedValue.trim();

  if (!key) {
    problems.push(`Line ${lineNumber} has an empty key.`);
    return;
  }

  const quoteMatch = value.match(/^(['"])([\s\S]*)\1$/);
  if (quoteMatch) {
    value = quoteMatch[2];
  }

  if (!value.length) {
    problems.push(`Line ${lineNumber} (${key}) does not have a value.`);
    return;
  }

  const hidden = [...hiddenKeyChars, ...hiddenValueChars];

  if (entries.has(key)) {
    const previous = entries.get(key)!;
    duplicates.push({ key, previousLine: previous.line, currentLine: lineNumber });
  }

  entries.set(key, { key, value, line: lineNumber, hidden });
});

if (problems.length) {
  console.error("✖ Validation failed.\n");
  problems.forEach((problem) => console.error(` - ${problem}`));
  process.exit(1);
}

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

fs.rmSync(SECRETS_DIR, { recursive: true, force: true });
fs.mkdirSync(SECRETS_DIR, { recursive: true });

const cleanEnv = Array.from(entries.values())
  .map((entry) => `${entry.key}=${entry.value}`)
  .join("\n")
  .concat("\n");

fs.writeFileSync(CLEAN_ENV_PATH, cleanEnv, "utf8");

for (const entry of entries.values()) {
  const filePath = path.join(SECRETS_DIR, `${entry.key}.txt`);
  fs.writeFileSync(filePath, entry.value, "utf8");
}

const uploadScript = [
  "$ErrorActionPreference = \"Stop\"",
  "$secretDir = Join-Path $PSScriptRoot 'secrets'",
  "if (-not (Test-Path $secretDir)) {",
  "  throw \"Missing secrets directory: $secretDir\"",
  "}",
  "function Ensure-SecretExists {",
  "  param([string]$Name)",
  "  gcloud secrets describe $Name --format=\"value(name)\" | Out-Null",
  "  if ($LASTEXITCODE -ne 0) {",
  "    Write-Host \"Creating secret $Name...\"",
  "    gcloud secrets create $Name --replication-policy=automatic | Out-Null",
  "  }",
  "}",
  "Get-ChildItem -Path $secretDir -Filter '*.txt' | ForEach-Object {",
  "  $name = $_.BaseName",
  "  $dataFile = $_.FullName",
  "  Ensure-SecretExists -Name $name",
  "  Write-Host \"Uploading $name...\"",
  "  gcloud secrets versions add $name --data-file=\"$dataFile\" | Out-Null",
  "}",
  "Write-Host 'All secrets uploaded successfully.'"
].join("\r\n");

fs.writeFileSync(UPLOAD_SCRIPT_PATH, uploadScript, "utf8");

const hiddenValues = Array.from(entries.values())
  .filter((entry) => entry.hidden.length > 0)
  .map((entry) => ({ key: entry.key, line: entry.line, hidden: entry.hidden }));

const report = {
  source: ENV_SOURCE,
  cleanEnvPath: CLEAN_ENV_PATH,
  secretsDir: SECRETS_DIR,
  uploadScript: UPLOAD_SCRIPT_PATH,
  totalKeys: entries.size,
  duplicates,
  hiddenValues,
};

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

console.log(`✔ Clean environment file written to ${CLEAN_ENV_PATH}`);
console.log(`✔ Secret payloads saved to ${SECRETS_DIR}`);
console.log(`✔ Upload helper script created at ${UPLOAD_SCRIPT_PATH}`);
console.log(`ℹ Report saved to ${REPORT_PATH}`);

if (duplicates.length) {
  console.warn("! Duplicate keys detected (last value kept):");
  duplicates.forEach((dup) => {
    console.warn(`  - ${dup.key} (first: line ${dup.previousLine}, overwritten by line ${dup.currentLine})`);
  });
}

if (hiddenValues.length) {
  console.warn("! Keys that contained hidden characters (they were stripped):");
  hiddenValues.forEach((entry) => {
    console.warn(`  - ${entry.key} (line ${entry.line}): ${entry.hidden.join(", ")}`);
  });
}

console.log("\nNext steps:");
console.log("  1. Run: npx tsx scripts/build-env-secrets.ts");
console.log("  2. Review tmp/secrets-report.json for the summary.");
console.log("  3. Execute: pwsh tmp/upload-secrets.ps1 to push every value to Secret Manager.");
console.log("  4. Optionally open .env.build.clean to verify the sanitized values.");
