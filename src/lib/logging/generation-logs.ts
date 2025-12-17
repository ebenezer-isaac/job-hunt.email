import { getDb } from "@/lib/firebase-admin";
import { createDebugLogger } from "@/lib/debug-logger";
import { sessionRepository } from "@/lib/session";

type LogLevel = "info" | "success" | "warning" | "error";

export type GenerationLogEntry = {
  id: string;
  content: string;
  timestamp: string;
  level: LogLevel;
};

const RUN_COLLECTION = "generationLogs";
const ENTRIES_COLLECTION = "entries";
const logger = createDebugLogger("generation-logs");
const db = getDb();

async function assertSessionOwnership(sessionId: string, userId: string) {
  const session = await sessionRepository.getSession(sessionId);
  if (!session || session.userId !== userId) {
    throw new Error("Session not found or access denied");
  }
  return session;
}

export async function startGenerationLog(sessionId: string, userId: string, generationId: string): Promise<void> {
  await assertSessionOwnership(sessionId, userId);
  const runsRef = db.collection("sessions").doc(sessionId).collection(RUN_COLLECTION);
  const existingSnap = await runsRef.get();
  const existingDoc = await runsRef.doc(generationId).get();
  const now = new Date().toISOString();
  const index = existingDoc.exists ? (existingDoc.data()?.index as number | undefined) ?? existingSnap.size : existingSnap.size + 1;

  await runsRef.doc(generationId).set({
    generationId,
    index,
    status: "in-progress",
    startedAt: existingDoc.exists ? existingDoc.data()?.startedAt ?? now : now,
    lastUpdatedAt: now,
  }, { merge: true });

  logger.step("Started generation log", { sessionId, generationId, index });
}

export async function appendGenerationLog(
  sessionId: string,
  userId: string,
  generationId: string,
  entry: { content: string; level?: LogLevel },
): Promise<void> {
  await assertSessionOwnership(sessionId, userId);
  const runRef = db.collection("sessions").doc(sessionId).collection(RUN_COLLECTION).doc(generationId);
  const runSnap = await runRef.get();
  if (!runSnap.exists) {
    logger.warn("appendGenerationLog called without existing record", { sessionId, generationId });
    return;
  }
  const now = new Date().toISOString();
  const entryRef = runRef.collection(ENTRIES_COLLECTION).doc();
  await entryRef.set({
    id: entryRef.id,
    content: entry.content,
    timestamp: now,
    level: entry.level ?? "info",
  });
  await runRef.set({ lastUpdatedAt: now }, { merge: true });
}

export async function finalizeGenerationLog(
  sessionId: string,
  userId: string,
  generationId: string,
  status: "completed" | "failed",
  summary?: string,
): Promise<void> {
  await assertSessionOwnership(sessionId, userId);
  const runRef = db.collection("sessions").doc(sessionId).collection(RUN_COLLECTION).doc(generationId);
  const runSnap = await runRef.get();
  if (!runSnap.exists) {
    logger.warn("finalizeGenerationLog called without existing record", { sessionId, generationId });
    return;
  }
  const now = new Date().toISOString();
  await runRef.set({
    status,
    lastUpdatedAt: now,
    summary: summary ?? runSnap.data()?.summary,
  }, { merge: true });
  logger.step("Finalized generation log", { sessionId, generationId, status });
}