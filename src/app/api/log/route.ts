import { NextResponse } from "next/server";
import { appendLogEntry } from "@/lib/logging/server-log-writer";
import type { LogEntry, LogLevel } from "@/lib/logging/types";
import { createDebugLogger, REQUEST_ID_HEADER } from "@/lib/debug-logger";
import { requireServerAuthTokens } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

type LogRequestBody = {
  entry?: Partial<LogEntry>;
};

const logger = createDebugLogger("api-log");

export async function POST(request: Request) {
  const headerRequestId = request.headers.get(REQUEST_ID_HEADER);
  logger.step("Incoming log ingestion request", {
    headerRequestId: headerRequestId ?? null,
  });
  try {
    await requireServerAuthTokens();
  } catch (authError) {
    logger.warn("Unauthenticated log ingestion attempt", {
      headerRequestId: headerRequestId ?? null,
      error: authError instanceof Error ? authError.message : String(authError),
    });
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as LogRequestBody;
    if (!body || typeof body !== "object" || !body.entry) {
      logger.warn("Rejected log request: payload missing entry", {
        headerRequestId: headerRequestId ?? null,
      });
      return NextResponse.json({ error: "Log entry missing" }, { status: 400 });
    }
    const normalized = normalizeEntry(body.entry, headerRequestId ?? undefined);
    if (!normalized) {
      logger.warn("Rejected log request: normalization failed", {
        headerRequestId: headerRequestId ?? null,
      });
      return NextResponse.json({ error: "Invalid log entry" }, { status: 422 });
    }
    logger.step("Appending normalized log entry", {
      scope: normalized.scope,
      level: normalized.level,
      entryRequestId: normalized.requestId ?? null,
      headerRequestId: headerRequestId ?? null,
    });
    await appendLogEntry(normalized);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Log ingestion failed", {
      headerRequestId: headerRequestId ?? null,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Unable to record log" }, { status: 400 });
  }
}

function normalizeEntry(entry: Partial<LogEntry>, headerRequestId?: string): LogEntry | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const level = coerceLevel(entry.level);
  if (!level) {
    return null;
  }
  const scope = typeof entry.scope === "string" && entry.scope.trim().length > 0 ? entry.scope : null;
  const message = typeof entry.message === "string" ? entry.message : null;
  if (!scope || !message) {
    return null;
  }
  return {
    timestamp: entry.timestamp && typeof entry.timestamp === "string"
      ? entry.timestamp
      : new Date().toISOString(),
    scope,
    level,
    message,
    data: entry.data,
    requestId:
      typeof entry.requestId === "string" && entry.requestId.length > 0
        ? entry.requestId
        : headerRequestId && headerRequestId.length > 0
          ? headerRequestId
          : undefined,
  } satisfies LogEntry;
}

function coerceLevel(level: unknown): LogLevel | null {
  if (typeof level !== "string") {
    return null;
  }
  return LEVELS.includes(level as LogLevel) ? (level as LogLevel) : null;
}
