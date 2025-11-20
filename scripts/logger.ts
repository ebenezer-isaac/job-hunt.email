import { promises as fs } from "node:fs";
import path from "node:path";

import { createDebugLogger } from "@/lib/debug-logger";
import type { DebugLogger } from "@/lib/debug-logger";
import type { LogEntry, LogTransport } from "@/lib/logging/types";

const loggerCache = new Map<string, DebugLogger>();

const LOG_ROOT = path.join(process.cwd(), "logs");
const SERVER_LOG_FILE = path.join(LOG_ROOT, "server-log.txt");

let initialized = false;

async function ensureLogDirectory(): Promise<void> {
  if (initialized) {
    return;
  }
  await fs.mkdir(LOG_ROOT, { recursive: true });
  initialized = true;
}

function formatLogLine(entry: LogEntry): string {
  const parts = [entry.timestamp, `[${entry.scope}]`, entry.level.toUpperCase(), entry.message];
  if (entry.data !== undefined) {
    parts.push(serialize(entry.data));
  }
  if (entry.requestId) {
    parts.push(`requestId=${entry.requestId}`);
  }
  return parts.join(" ");
}

function serialize(value: unknown): string {
  if (value instanceof Error) {
    return JSON.stringify({ name: value.name, message: value.message, stack: value.stack });
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value === undefined) {
    return "undefined";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ fallback: String(value) });
  }
}

const transport: LogTransport = {
  async send(entry) {
    await ensureLogDirectory();
    const line = formatLogLine(entry);
    await fs.appendFile(SERVER_LOG_FILE, `${line}\n`, { encoding: "utf8" });
  },
};

export function getScriptLogger(scope: string): DebugLogger {
  if (!loggerCache.has(scope)) {
    loggerCache.set(scope, createDebugLogger(scope, { transport }));
  }
  return loggerCache.get(scope)!;
}
