import "server-only";

import { appendLogEntry } from "@/lib/logging/server-log-writer";
import type { LogEntry } from "@/lib/logging/types";

declare global {
  var __serverLogWriter__: ((entry: LogEntry) => Promise<void> | void) | undefined;
}

if (typeof globalThis !== "undefined" && !globalThis.__serverLogWriter__) {
  globalThis.__serverLogWriter__ = appendLogEntry;
}
