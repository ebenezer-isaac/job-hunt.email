#!/usr/bin/env tsx
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";
import { Timestamp } from "firebase-admin/firestore";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const isDev = process.env.NODE_ENV ? process.env.NODE_ENV !== "production" : true;
loadEnvConfig(projectRoot, isDev);

async function writeTestLog() {
  const { getDb } = await import("@/lib/firebase-admin");
  const db = getDb();

  const payload = {
    severity: "INFO",
    scope: "firestore-log-smoke-test",
    message: "TEST LOG from local development environment",
    timestamp: new Date().toISOString(),
    data: {
      testId: crypto.randomUUID(),
      hostname: process.env.COMPUTERNAME ?? "unknown",
    },
    environment: process.env.NODE_ENV ?? "development",
    createdAt: Timestamp.now(),
  };

  const docRef = await db.collection("appLogs").add(payload);
  console.log(`✅ Firestore log written: ${docRef.id}`);
}

writeTestLog().catch((error) => {
  console.error("❌ FAILED to write Firestore log:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
