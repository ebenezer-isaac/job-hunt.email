import type { LogEntry, LogLevel, LogTransport } from "@/lib/logging/types";
import { sanitizeForLogging } from "@/lib/logging/redaction";
import { PUBLIC_ROUTE_SEGMENTS } from "./auth-shared";

type HttpTransportOptions = {
  headers?: Record<string, string>;
};

export type DebugLogger = {
  step: (message: string, payload?: unknown) => void;
  data: (label: string, payload: unknown) => void;
  info: (message: string, payload?: unknown) => void;
  warn: (message: string, payload?: unknown) => void;
  error: (message: string, payload?: unknown) => void;
  withRequestId: (requestId: string) => DebugLogger;
};

type LoggerOptions = {
  requestId?: string;
  transport?: LogTransport;
};

export const LOG_ENDPOINT_PATH = "/api/log";
export const REQUEST_ID_HEADER = "x-request-id";

declare global {
  var __serverLogWriter__:
    | undefined
    | ((entry: LogEntry) => Promise<void> | void);
  var __getActiveRequestId__:
    | undefined
    | (() => string | undefined);
}

const isBrowser = typeof window !== "undefined";

const PUBLIC_PATH_PREFIXES = PUBLIC_ROUTE_SEGMENTS.map((route) => normalizePathname(route));

let activeClientRequestId: string | undefined;

export function setClientRequestId(requestId: string | null | undefined): void {
  if (!isBrowser) {
    return;
  }
  activeClientRequestId = requestId ?? undefined;
}

export function getClientRequestId(): string | undefined {
  return activeClientRequestId;
}

const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let cachedMinLogLevel: LogLevel | null = null;

function isLogLevel(value: string | undefined): value is LogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error";
}

function resolveMinLogLevel(): LogLevel {
  const envSource: Record<string, string | undefined> =
    typeof process !== "undefined" ? ((process.env ?? {}) as Record<string, string | undefined>) : {};
  const preferred = isBrowser
    ? envSource.NEXT_PUBLIC_LOG_LEVEL ?? envSource.LOG_LEVEL
    : envSource.LOG_LEVEL ?? envSource.NEXT_PUBLIC_LOG_LEVEL;
  if (isLogLevel(preferred)) {
    return preferred;
  }
  const nodeEnv = envSource.NODE_ENV ?? (typeof process !== "undefined" ? process.env?.NODE_ENV : undefined);
  return nodeEnv === "development" ? "debug" : "info";
}

function getMinLogLevel(): LogLevel {
  if (!cachedMinLogLevel) {
    cachedMinLogLevel = resolveMinLogLevel();
  }
  return cachedMinLogLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_RANK[level] >= LOG_LEVEL_RANK[getMinLogLevel()];
}

export function createDebugLogger(scope: string, options?: LoggerOptions): DebugLogger {
  let stepIndex = 0;
  const baseOptions: LoggerOptions = { ...options };
  let resolvedTransport: LogTransport | null | undefined = baseOptions.transport;

  const log = (level: LogLevel, message: string, payload?: unknown, currentStep?: number) => {
    if (!shouldLog(level)) {
      return;
    }
    const resolvedRequestId = baseOptions.requestId ?? getAmbientRequestId();
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      scope,
      level,
      message: formatMessage(message, currentStep),
      data: normalizePayload(payload),
      requestId: resolvedRequestId,
    };
    dispatch(entry, getTransport());
  };

  const getTransport = (): LogTransport | null => {
    if (resolvedTransport === undefined) {
      resolvedTransport = baseOptions.transport ?? createDefaultTransport();
    }
    return resolvedTransport ?? null;
  };

  return {
    step(message, payload) {
      stepIndex += 1;
      log("debug", message, payload, stepIndex);
    },
    data(label, payload) {
      log("debug", `data::${label}`, payload ?? "<empty>");
    },
    info(message, payload) {
      log("info", message, payload);
    },
    warn(message, payload) {
      log("warn", message, payload);
    },
    error(message, payload) {
      log("error", message, payload);
    },
    withRequestId(requestId: string) {
      return createDebugLogger(scope, { ...baseOptions, requestId });
    },
  };
}

export function createHttpLogTransport(origin: string, options?: HttpTransportOptions): LogTransport {
  const endpoint = `${trimTrailingSlash(origin)}${LOG_ENDPOINT_PATH}`;
  return {
    send(entry) {
      return sendEntryToEndpoint(endpoint, entry, options);
    },
  };
}

export function createConsoleLogTransport(): LogTransport {
  return {
    send(entry) {
      if (!isBrowser) {
        const payload: Record<string, unknown> = {
          severity: levelToSeverity(entry.level),
          message: entry.message,
          scope: entry.scope,
          timestamp: entry.timestamp,
        };
        if (entry.requestId) {
          payload.requestId = entry.requestId;
        }
        if (entry.data !== undefined) {
          payload.data = entry.data;
        }

        const logFn = entry.level === "error" ? console.error : console.log;
        try {
          logFn(JSON.stringify(payload));
        } catch {
          logFn(
            JSON.stringify({
              severity: "ERROR",
              message: "Failed to serialize log entry",
              originalMessage: entry.message,
              timestamp: new Date().toISOString(),
            }),
          );
        }
        return;
      }

      const logger = getConsoleMethod(entry.level);
      const prefix = `[${entry.scope}] ${entry.message}`;
      if (entry.requestId) {
        if (entry.data !== undefined) {
          logger(`${prefix} requestId=${entry.requestId}`, entry.data);
        } else {
          logger(`${prefix} requestId=${entry.requestId}`);
        }
        return;
      }
      if (entry.data !== undefined) {
        logger(prefix, entry.data);
      } else {
        logger(prefix);
      }
    },
  };
}

function levelToSeverity(level: LogLevel): "DEBUG" | "INFO" | "WARNING" | "ERROR" {
  switch (level) {
    case "debug":
      return "DEBUG";
    case "info":
      return "INFO";
    case "warn":
      return "WARNING";
    case "error":
    default:
      return "ERROR";
  }
}

function dispatch(entry: LogEntry, transport: LogTransport | null): void {
  if (!transport) {
    mirrorEntryToConsole(entry);
    return;
  }
  try {
    const result = transport.send(entry);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).catch(() => undefined);
    }
  } catch {
    // Swallow logging transport errors to avoid interfering with request flow.
  } finally {
    mirrorEntryToConsole(entry);
  }
}

const severityStyles: Record<LogLevel, { color: string; method: "log" | "info" | "warn" | "error" | "debug" }> = {
  debug: { color: "#64748b", method: "debug" },
  info: { color: "#2563eb", method: "info" },
  warn: { color: "#d97706", method: "warn" },
  error: { color: "#dc2626", method: "error" },
};

function mirrorEntryToConsole(entry: LogEntry): void {
  if (!isBrowser || typeof console === "undefined") {
    return;
  }
  const severity = severityStyles[entry.level] ?? severityStyles.info;
  const scopeLabel = entry.scope ?? "unknown";
  const baseLabel = entry.message.startsWith("data::") ? "DATA" : entry.level.toUpperCase();
  const header = `%c[${baseLabel}]%c ${scopeLabel} :: ${entry.message}`;
  const args: unknown[] = [
    header,
    `color:${severity.color}; font-weight:600;`,
    "color:inherit; font-weight:500;",
  ];
  if (entry.requestId) {
    args.push({ requestId: entry.requestId });
  }
  if (entry.data !== undefined) {
    args.push(entry.data);
  }
  const method = console[severity.method] ?? console.log;
  try {
    method.apply(console, args as []);
  } catch {
    // no-op
  }
}

function formatMessage(message: string, stepIndex?: number): string {
  if (!stepIndex) {
    return message;
  }
  return `step-${stepIndex} ${message}`;
}

function normalizePayload(payload: unknown): unknown {
  let workingPayload = payload;
  if (workingPayload instanceof Error) {
    workingPayload = {
      name: workingPayload.name,
      message: workingPayload.message,
      stack: workingPayload.stack,
    };
  }
  if (typeof workingPayload === "bigint") {
    workingPayload = workingPayload.toString();
  }
  if (workingPayload === undefined) {
    return undefined;
  }
  return sanitizeForLogging(workingPayload);
}

function createDefaultTransport(): LogTransport | null {
  if (!isBrowser) {
    if (typeof globalThis !== "undefined") {
      const writer = globalThis.__serverLogWriter__;
      if (writer) {
        return {
          send(entry) {
            try {
              return Promise.resolve(writer(entry));
            } catch (error) {
              return Promise.reject(error);
            }
          },
        };
      }
    }
    return createConsoleLogTransport();
  }

  if (shouldSuppressBrowserTransport()) {
    return null;
  }

  const endpoint = resolveLogEndpoint();
  if (!endpoint) {
    return null;
  }
  return {
    send(entry) {
      return sendEntryToEndpoint(endpoint, entry);
    },
  };
}

function resolveLogEndpoint(): string | null {
  if (isBrowser) {
    return LOG_ENDPOINT_PATH;
  }
  const env: Record<string, string | undefined> =
    typeof process !== "undefined" ? (process.env as Record<string, string | undefined>) ?? {} : {};
  const explicit = env.LOG_API_ENDPOINT ?? env.NEXT_PUBLIC_LOG_API_ENDPOINT;
  if (explicit) {
    return trimTrailingSlash(explicit);
  }
  const baseUrl =
    env.NEXT_PUBLIC_APP_URL ??
    env.APP_URL ??
    (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined) ??
    (env.NODE_ENV === "development" ? "http://localhost:3000" : undefined);
  if (!baseUrl) {
    return null;
  }
  return `${trimTrailingSlash(baseUrl)}${LOG_ENDPOINT_PATH}`;
}

function shouldSuppressBrowserTransport(): boolean {
  if (!isBrowser || typeof window === "undefined" || !window.location) {
    return false;
  }
  const pathname = normalizePathname(window.location.pathname ?? "/");
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function sendEntryToEndpoint(endpoint: string, entry: LogEntry, options?: HttpTransportOptions): Promise<void> {
  const resolvedRequestId = entry.requestId ?? getAmbientRequestId();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(options?.headers ?? {}),
  };
  if (resolvedRequestId) {
    headers[REQUEST_ID_HEADER] = resolvedRequestId;
  }
  return fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ entry }),
    keepalive: typeof navigator !== "undefined" && "sendBeacon" in navigator,
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return undefined;
    })
    .catch((error) => {
      warnLogEndpointFailure(endpoint, entry, error);
      throw error;
    });
}

function warnLogEndpointFailure(endpoint: string, entry: LogEntry, error: unknown): void {
  if (typeof console === "undefined" || !console.warn) {
    return;
  }
  console.warn(
    `[debug-logger] Failed to send log entry to ${endpoint}: ${error instanceof Error ? error.message : String(error)}`,
    {
      scope: entry.scope,
      level: entry.level,
      requestId: entry.requestId ?? null,
    },
  );
}

function getAmbientRequestId(): string | undefined {
  if (isBrowser) {
    return activeClientRequestId;
  }
  return getServerRequestIdFromGlobal();
}

function getServerRequestIdFromGlobal(): string | undefined {
  if (typeof globalThis === "undefined") {
    return undefined;
  }
  const accessor = globalThis.__getActiveRequestId__;
  if (typeof accessor !== "function") {
    return undefined;
  }
  try {
    return accessor();
  } catch {
    return undefined;
  }
}

function getConsoleMethod(level: LogLevel): (...args: unknown[]) => void {
  switch (level) {
    case "error":
      return typeof console !== "undefined" && console.error ? console.error.bind(console) : () => undefined;
    case "warn":
      return typeof console !== "undefined" && console.warn ? console.warn.bind(console) : () => undefined;
    case "info":
      return typeof console !== "undefined" && console.info ? console.info.bind(console) : () => undefined;
    default:
      return typeof console !== "undefined" && console.debug ? console.debug.bind(console) : () => undefined;
  }
}
