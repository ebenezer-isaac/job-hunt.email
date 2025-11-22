#!/usr/bin/env tsx
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const isDev = process.env.NODE_ENV ? process.env.NODE_ENV !== "production" : true;
loadEnvConfig(projectRoot, isDev);

const COLLECTION_NAME = process.env.FIREBASE_LOG_COLLECTION ?? "appLogs";
const FETCH_LIMIT = Number(process.env.FIREBASE_LOG_FETCH_LIMIT ?? "50");

function formatLine(index: number, data: Record<string, unknown>): string {
  const createdAt = typeof data.createdAt === "object" && data.createdAt !== null && "toDate" in data
    ? (data.createdAt as { toDate: () => Date }).toDate().toISOString()
    : data.timestamp ?? "unknown";
  const severity = (data.severity as string) ?? "UNKNOWN";
  const scope = (data.scope as string) ?? "unknown";
  const requestId = (data.requestId as string) ?? null;
  const message = (data.message as string) ?? "<no-message>";
  const parts = [
    `${index.toString().padStart(2, "0")}.`,
    `[${createdAt}]`,
    severity,
    scope,
    "-",
    message,
  ];
  if (requestId) {
    parts.push(`(requestId=${requestId})`);
  }
  return parts.join(" ");
}

async function dumpLogs(): Promise<void> {
  const { getDb } = await import("@/lib/firebase-admin");
  const db = getDb();
  const snapshot = await db
    .collection(COLLECTION_NAME)
    .orderBy("createdAt", "desc")
    .limit(FETCH_LIMIT)
    .get();

  if (snapshot.empty) {
    console.log(`No logs found in collection '${COLLECTION_NAME}'.`);
    return;
  }

  console.log(`Fetched ${snapshot.size} log entries from '${COLLECTION_NAME}'.\n`);

  let index = 1;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    console.log(formatLine(index, data));
    if (data.data) {
      console.dir(data.data, { depth: 5 });
    }
    if (data.context) {
      console.dir({ context: data.context }, { depth: 5 });
    }
    console.log("-");
    index += 1;
  }
}

dumpLogs().catch((error) => {
  console.error("Failed to dump logs:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
