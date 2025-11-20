import "server-only";

import { promises as fs } from "fs";
import path from "node:path";
import { env } from "@/env";
import { type LogEntry, type LogLevel } from "@/lib/logging/types";
import { getRequestLogContext, type RequestLogContext } from "@/lib/logging/request-log-registry";
import { getActiveRequestId } from "@/lib/logging/request-id-context";

const LOG_ROOT = path.join(process.cwd(), "logs");
const REQUEST_LOG_DIR = path.join(LOG_ROOT, "requests");
const SERVER_LOG_FILE = path.join(LOG_ROOT, "server-log.txt");

const initializedHeaders = new Set<string>();

let initialized = false;

const requestLogDebugEnabled = env.LOG_REQUEST_DEBUG;
const INTERNAL_SCOPE = "server-log-writer";

function debugRequestLog(message: string, metadata?: Record<string, unknown>): void {
  if (!requestLogDebugEnabled) {
    return;
  }
  emitInternalLog("debug", message, metadata);
}

function emitInternalLog(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    scope: INTERNAL_SCOPE,
    level,
    message,
    data: metadata,
  };
  void ensureLogDirectories()
    .then(() => appendLine(SERVER_LOG_FILE, formatLogLine(entry)))
    .catch(() => undefined);
}

function reportLogFailure(error: unknown): void {
  emitInternalLog("error", "Failed to append log entry", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

async function ensureLogDirectories(): Promise<void> {
  if (initialized) {
    return;
  }
  await fs.mkdir(LOG_ROOT, { recursive: true });
  await fs.mkdir(REQUEST_LOG_DIR, { recursive: true });
  initialized = true;
  debugRequestLog("Ensured log directories", {
    root: LOG_ROOT,
    requestDir: REQUEST_LOG_DIR,
  });
}

function sanitizeSegment(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
  return normalized || fallback;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatTimestamp(new Date().toISOString());
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function buildRequestFileName(requestId: string, context: RequestLogContext): string {
  const timestamp = formatTimestamp(context.createdAt);
  const company = sanitizeSegment(context.companyName, "company");
  const role = sanitizeSegment(context.jobTitle, "role");
  const suffix = requestId.replace(/[^a-zA-Z0-9]/g, "").slice(-6) || "req";
  return `${timestamp}_${company}_${role}_${suffix}`;
}

function serializeData(data: unknown): string | undefined {
  if (data === undefined) {
    return undefined;
  }
  if (data instanceof Error) {
    return JSON.stringify({
      name: data.name,
      message: data.message,
      stack: data.stack,
    });
  }
  if (typeof data === "bigint") {
    return data.toString();
  }
  try {
    return JSON.stringify(data);
  } catch (error) {
    return JSON.stringify({
      fallback: String(data),
      error: error instanceof Error ? error.message : "serialization-failed",
    });
  }
}

function formatLogLine(entry: LogEntry): string {
  const parts = [
    entry.timestamp,
    `[${entry.scope}]`,
    entry.level.toUpperCase(),
    entry.message,
  ];
  const serialized = serializeData(entry.data);
  if (serialized) {
    parts.push(serialized);
  }
  if (entry.requestId) {
    parts.push(`requestId=${entry.requestId}`);
  }
  return parts.join(" ");
}

async function appendLine(filePath: string, line: string): Promise<void> {
  await fs.appendFile(filePath, `${line}\n`, { encoding: "utf8" });
}

async function ensureRequestLogHeader(filePath: string, context: RequestLogContext): Promise<void> {
  if (initializedHeaders.has(filePath)) {
    return;
  }
  try {
    await fs.access(filePath);
    initializedHeaders.add(filePath);
    return;
  } catch {
    // fallthrough to write header
  }
  const headerLines = [
    "=== Generation Request Log ===",
    `createdAt: ${context.createdAt}`,
    `company: ${context.companyName ?? "<unknown>"}`,
    `role: ${context.jobTitle ?? "<unknown>"}`,
    context.sessionId ? `sessionId: ${context.sessionId}` : null,
    context.mode ? `mode: ${context.mode}` : null,
    "",
  ].filter(Boolean) as string[];
  await fs.appendFile(filePath, `${headerLines.join("\n")}\n`, { encoding: "utf8" });
  initializedHeaders.add(filePath);
  debugRequestLog("Initialized request log file", { filePath });
}

export async function appendLogEntry(entry: LogEntry): Promise<void> {
  try {
    await ensureLogDirectories();
    const resolvedRequestId = entry.requestId ?? getActiveRequestId();
    const entryWithContext = resolvedRequestId ? { ...entry, requestId: resolvedRequestId } : entry;
    const line = formatLogLine(entryWithContext);
    debugRequestLog("appendLogEntry invoked", {
      scope: entry.scope,
      level: entry.level,
      hasRequestId: Boolean(entryWithContext.requestId),
    });
    await appendLine(SERVER_LOG_FILE, line);
    debugRequestLog("Wrote entry to server log", { scope: entry.scope, level: entry.level });
    if (entryWithContext.requestId) {
      const context = getRequestLogContext(entryWithContext.requestId);
      if (!context) {
        debugRequestLog("Missing request context", { requestId: entryWithContext.requestId });
        return;
      }
      const fileName = buildRequestFileName(entryWithContext.requestId, context);
      const requestFile = path.join(REQUEST_LOG_DIR, `${fileName}.log`);
      debugRequestLog("Writing request log entry", { requestFile });
      await ensureRequestLogHeader(requestFile, context);
      await appendLine(requestFile, line);
      debugRequestLog("Wrote entry to request log", { requestFile });
    }
  } catch (error) {
    reportLogFailure(error);
    throw error;
  }
}

export const logPaths = {
  root: LOG_ROOT,
  serverLog: SERVER_LOG_FILE,
  requestLogs: REQUEST_LOG_DIR,
};
