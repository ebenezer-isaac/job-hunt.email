#!/usr/bin/env tsx
/**
 * Prints a curated list of project scripts to the terminal.
 * Keep this file in sync with the "Script Commands" section of README.md.
 */

type CommandEntry = {
  command: string;
  description: string;
  notes?: string;
};

type CommandSection = {
  title: string;
  entries: CommandEntry[];
};

const npmScriptSection: CommandSection = {
  title: "npm scripts",
  entries: [
    {
      command: "npm run dev",
      description: "Boots the dev server via scripts/dev.ts (seeds vector store, then runs next dev).",
    },
    {
      command: "npm run dev:nodemon",
      description: "Starts nodemon with nodemon.json for lighter backend reload loops.",
    },
    {
      command: "npm run build",
      description: "Runs next build to create the production bundle (requires full env, inc. NEXT_SERVER_ACTIONS_ENCRYPTION_KEY).",
    },
    {
      command: "npm run start",
      description: "Serves the pre-built app through next start using the build-time env.",
    },
    {
      command: "npm run lint",
      description: "Executes ESLint across the repository.",
    },
    {
      command: "npm run test",
      description: "Runs the Vitest suite in run mode.",
    },
    {
      command: "npm run seed:vector-store",
      description: "Manually seeds the LlamaIndex vector store with the recon strategy document.",
      notes: "Requires LLAMAINDEX_ENABLE_PERSISTENCE=true.",
    },
    {
      command: "npm run deploy",
      description: "Runs scripts/deploy.ts to sync secrets, build via Cloud Build, and deploy Cloud Run.",
      notes: "Uses values from .env.build; ensure it's up to date before running.",
    },
    {
      command: "npm run help",
      description: "Prints this command reference to the terminal.",
    },
  ],
};

const utilitySections: CommandSection[] = [
  {
    title: "Utility scripts (npx tsx)",
    entries: [
      {
        command: "npx tsx scripts/build-env-secrets.ts",
        description: "Sanitizes .env.build, emits .env.build.clean plus tmp/secrets payloads and upload-secrets.ps1.",
        notes: "Follow up with pwsh tmp/upload-secrets.ps1 to push to Secret Manager.",
      },
      {
        command: "npx tsx scripts/delete-all-secrets.ts",
        description: "Deletes every Secret Manager secret in the active gcloud project.",
        notes: "Destructive; only use for sandboxes/reset flows.",
      },
      {
        command: "npx tsx scripts/seed-vector-store.ts",
        description: "Seeds the recon strategy document into the persisted vector store.",
        notes: "Fails unless LLAMAINDEX_ENABLE_PERSISTENCE is true.",
      },
      {
        command: "npx tsx scripts/export-prompts.ts",
        description: "Regenerates src/prompts.json from src/lib/ai/prompts.ts plus metadata.",
      },
      {
        command: "npx tsx scripts/expire-processing.ts",
        description: "Marks sessions past processingDeadline as failed and releases quota holds.",
        notes: "Safe to wire into cron/Cloud Scheduler.",
      },
      {
        command: "npx tsx scripts/clear-firestore-logs.ts --force",
        description: "Deletes Firestore log documents in batches from the configured collection.",
        notes: "--force (or -y) required to proceed.",
      },
      {
        command: "npx tsx scripts/dump-firestore-logs.ts",
        description: "Prints the most recent Firestore logs to stdout for quick inspection.",
      },
      {
        command: "npx tsx scripts/render-firestore-log-viewer.ts --limit=500",
        description: "Generates tmp/firebase-log-viewer.html with a searchable log UI.",
        notes: "Tune --limit for different snapshot sizes.",
      },
      {
        command: "npx tsx scripts/test-firestore-logging.ts",
        description: "Writes a sample INFO log entry into appLogs using local credentials.",
      },
      {
        command: "npx tsx scripts/test-gcp-logging.ts",
        description: "Same payload as above but intended for Cloud Run / GCP smoke tests.",
        notes: "Run inside the deployed environment to validate IAM and routing.",
      },
      {
        command: "npx tsx scripts/test-gemini-generation.ts",
        description: "Exercises the configured Gemini model(s) with a sample prompt.",
        notes: "Requires GEMINI_API_KEY and model env vars in .env.local.",
      },
      {
        command: "npx tsx scripts/test-rag-generation.ts",
        description: "Validates the LlamaIndex runtime by running a tiny RAG query end-to-end.",
      },
    ],
  },
  {
    title: "Other helpers",
    entries: [
      {
        command: "node scripts/tools/test-fetch.js",
        description: "Sends a sample payload to /api/log using the ACCESS_CONTROL_INTERNAL_TOKEN.",
        notes: "Set the token in your shell before running.",
      },
      {
        command: "pwsh scripts/remediate-logging.ps1",
        description: "Restores Cloud Run logging IAM bindings and inspects the _Default log sink.",
        notes: "Requires gcloud CLI with project access.",
      },
      {
        command: "pwsh tmp/upload-secrets.ps1",
        description: "Uploads every secret payload generated by build-env-secrets.ts to Secret Manager.",
        notes: "Re-run after rotating values in .env.build.",
      },
    ],
  },
];

function printSection(section: CommandSection): void {
  console.log(`\n${section.title}`);
  console.log("-".repeat(section.title.length));
  section.entries.forEach((entry) => {
    console.log(`  ${entry.command}`);
    console.log(`    ${entry.description}`);
    if (entry.notes) {
      console.log(`    Note: ${entry.notes}`);
    }
  });
}

function main(): void {
  console.log("Project command reference\n==========================");
  printSection(npmScriptSection);
  utilitySections.forEach(printSection);
  console.log("\nTip: All TypeScript helpers assume you've run npm install so tsx is available.");
}

main();
