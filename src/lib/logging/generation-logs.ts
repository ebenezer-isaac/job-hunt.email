import { randomUUID } from "node:crypto";

import { createDebugLogger } from "@/lib/debug-logger";
import { sessionRepository, type SessionRecord } from "@/lib/session";

type LogLevel = "info" | "success" | "warning" | "error";

export type GenerationLogEntry = {
  id: string;
  content: string;
  timestamp: string;
  level: LogLevel;
};

export type GenerationLogRecord = {
  generationId: string;
  index: number;
  status: "pending" | "in-progress" | "completed" | "failed";
  startedAt: string;
  lastUpdatedAt: string;
  logs: GenerationLogEntry[];
  summary?: string;
};

const logger = createDebugLogger("generation-logs");

function ensureLogs(session: SessionRecord): GenerationLogRecord[] {
  const raw = session.metadata?.generationLogs;
  if (Array.isArray(raw)) {
    return raw as GenerationLogRecord[];
  }
  return [];
}

function writeLogs(sessionId: string, userId: string, logs: GenerationLogRecord[]): Promise<SessionRecord> {
  return sessionRepository.updateSession(
    sessionId,
    {
      metadata: {
        generationLogs: logs,
      },
    },
    userId,
  );
}

export async function startGenerationLog(sessionId: string, userId: string, generationId: string): Promise<void> {
  const session = await sessionRepository.getSession(sessionId);
  if (!session || session.userId !== userId) {
    throw new Error("Session not found or access denied");
  }
  const existing = ensureLogs(session).filter((entry) => entry.generationId !== generationId);
  const index = existing.length + 1;
  const now = new Date().toISOString();
  const record: GenerationLogRecord = {
    generationId,
    index,
    status: "in-progress",
    startedAt: now,
    lastUpdatedAt: now,
    logs: [],
  };
  await writeLogs(sessionId, userId, [...existing, record]);
  logger.step("Started generation log", { sessionId, generationId, index });
}

export async function appendGenerationLog(
  sessionId: string,
  userId: string,
  generationId: string,
  entry: { content: string; level?: LogLevel },
): Promise<void> {
  const session = await sessionRepository.getSession(sessionId);
  if (!session || session.userId !== userId) {
    throw new Error("Session not found or access denied");
  }
  const logs = ensureLogs(session);
  const target = logs.find((item) => item.generationId === generationId);
  if (!target) {
    logger.warn("appendGenerationLog called without existing record", { sessionId, generationId });
    return;
  }
  const now = new Date().toISOString();
  target.logs.push({
    id: randomUUID(),
    content: entry.content,
    timestamp: now,
    level: entry.level ?? "info",
  });
  target.lastUpdatedAt = now;
  await writeLogs(sessionId, userId, logs);
}

export async function finalizeGenerationLog(
  sessionId: string,
  userId: string,
  generationId: string,
  status: "completed" | "failed",
  summary?: string,
): Promise<void> {
  const session = await sessionRepository.getSession(sessionId);
  if (!session || session.userId !== userId) {
    throw new Error("Session not found or access denied");
  }
  const logs = ensureLogs(session);
  const target = logs.find((item) => item.generationId === generationId);
  if (!target) {
    logger.warn("finalizeGenerationLog called without existing record", { sessionId, generationId });
    return;
  }
  const now = new Date().toISOString();
  target.status = status;
  target.lastUpdatedAt = now;
  if (summary) {
    target.summary = summary;
  }
  await writeLogs(sessionId, userId, logs);
  logger.step("Finalized generation log", { sessionId, generationId, status });
}