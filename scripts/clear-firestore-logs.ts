#!/usr/bin/env tsx
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const isDev = process.env.NODE_ENV ? process.env.NODE_ENV !== "production" : true;
loadEnvConfig(projectRoot, isDev);

const COLLECTION_NAME = process.env.FIREBASE_LOG_COLLECTION ?? "appLogs";
const BATCH_SIZE = Number(process.env.FIREBASE_LOG_CLEAR_BATCH ?? "500");
const FORCE_FLAGS = new Set(["--force", "--yes", "-y"]);

function hasForceFlag(): boolean {
  return process.argv.some((arg) => FORCE_FLAGS.has(arg));
}

async function deleteBatch(): Promise<number> {
  const { getDb } = await import("@/lib/firebase-admin");
  const db = getDb();
  const snapshot = await db.collection(COLLECTION_NAME).orderBy("createdAt").limit(BATCH_SIZE).get();
  if (snapshot.empty) {
    return 0;
  }
  const batch = db.batch();
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
  return snapshot.size;
}

async function clearLogs(): Promise<void> {
  if (!hasForceFlag()) {
    console.error(
      "Refusing to delete Firestore logs without confirmation. Rerun with --force if you are sure.",
    );
    process.exitCode = 1;
    return;
  }

  let totalDeleted = 0;
  // keep deleting until empty
  for (;;) {
    const deleted = await deleteBatch();
    if (!deleted) {
      break;
    }
    totalDeleted += deleted;
    console.log(`Deleted ${deleted} documents (total ${totalDeleted}).`);
  }

  console.log(`✅ Cleared ${totalDeleted} log documents from '${COLLECTION_NAME}'.`);
}

clearLogs().catch((error) => {
  console.error("❌ Failed to clear Firestore logs:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
