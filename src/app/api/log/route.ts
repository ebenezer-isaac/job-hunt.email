import { NextResponse } from "next/server";
import { appendLogEntry } from "@/lib/logging/server-log-writer";
import type { LogEntry, LogLevel } from "@/lib/logging/types";
import { createDebugLogger, REQUEST_ID_HEADER } from "@/lib/debug-logger";
import { INTERNAL_TOKEN_HEADER, isValidInternalRequest } from "@/lib/security/internal-token";
import { sanitizeForLogging } from "@/lib/logging/redaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

const MAX_BODY_BYTES = 16 * 1024; // 16KB upper limit for ingestion payloads
const MAX_SCOPE_LENGTH = 64;
const MAX_MESSAGE_LENGTH = 256;
const MAX_DATA_DEPTH = 5;
const MAX_DATA_KEYS = 64;
const MAX_DATA_ARRAY_ITEMS = 32;
const LOG_CLIENT_HEADER = "x-log-client";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;

type RateLimitEntry = {
  count: number;
  windowStart: number;
};

const rateLimiter = new Map<string, RateLimitEntry>();

type LogRequestBody = {
  entry?: Partial<LogEntry>;
};

const logger = createDebugLogger("api-log");

export async function POST(request: Request) {
  const headerRequestId = request.headers.get(REQUEST_ID_HEADER);
  const internalToken = request.headers.get(INTERNAL_TOKEN_HEADER);
  const isInternal = internalToken ? isValidInternalRequest(internalToken) : false;
  logger.step("Incoming log ingestion request", {
    headerRequestId: headerRequestId ?? null,
    authMode: isInternal ? "internal-token" : "forbidden",
  });

  if (!isInternal) {
    logger.warn("Rejected log request: invalid internal token", {
      headerRequestId: headerRequestId ?? null,
      hasToken: Boolean(internalToken),
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rateLimitKey = getRateLimitKey(request.headers, internalToken);
  const rateLimit = consumeRateLimit(rateLimitKey);
  if (!rateLimit.allowed) {
    logger.warn("Rejected log request: throttled", {
      headerRequestId: headerRequestId ?? null,
      rateLimitKey,
      observedCount: rateLimit.count,
    });
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: LogRequestBody | null = null;
  let payloadSize = 0;
  try {
    const bounded = await readBoundedJson<LogRequestBody>(request, MAX_BODY_BYTES);
    payloadSize = bounded.byteLength;
    body = bounded.json;
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      logger.warn("Rejected log request: payload too large", {
        headerRequestId: headerRequestId ?? null,
        payloadSize: error.size,
      });
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    logger.error("Log ingestion failed during read", {
      headerRequestId: headerRequestId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !body.entry) {
    logger.warn("Rejected log request: payload missing entry", {
      headerRequestId: headerRequestId ?? null,
      payloadSize,
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
    payloadSize,
    rateLimitKey,
  });

  try {
    await appendLogEntry(normalized);
  } catch (error) {
    logger.error("Log ingestion failed", {
      headerRequestId: headerRequestId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Unable to record log" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function normalizeEntry(entry: Partial<LogEntry>, headerRequestId?: string): LogEntry | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const level = coerceLevel(entry.level);
  if (!level) {
    return null;
  }
  const scope = typeof entry.scope === "string" ? entry.scope.trim() : "";
  const message = typeof entry.message === "string" ? entry.message.trim() : "";
  if (!scope || !message) {
    return null;
  }
  if (scope.length > MAX_SCOPE_LENGTH || message.length > MAX_MESSAGE_LENGTH) {
    return null;
  }

  const sanitizedData = sanitizeEntryData(entry.data);

  return {
    timestamp:
      entry.timestamp && typeof entry.timestamp === "string"
        ? entry.timestamp
        : new Date().toISOString(),
    scope,
    level,
    message,
    data: sanitizedData,
    requestId: coerceRequestId(entry.requestId, headerRequestId),
  } satisfies LogEntry;
}

function coerceLevel(level: unknown): LogLevel | null {
  if (typeof level !== "string") {
    return null;
  }
  return LEVELS.includes(level as LogLevel) ? (level as LogLevel) : null;
}

function sanitizeEntryData(data: unknown): unknown {
  if (data === undefined) {
    return undefined;
  }
  const sanitized = sanitizeForLogging(data, { maxStringLength: 1024 });
  return pruneComplexStructures(sanitized, 0);
}

function pruneComplexStructures(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== "object") {
    return value;
  }
  if (depth >= MAX_DATA_DEPTH) {
    return "[truncated nested payload]";
  }
  if (Array.isArray(value)) {
    const subset = value
      .slice(0, MAX_DATA_ARRAY_ITEMS)
      .map((item) => pruneComplexStructures(item, depth + 1));
    if (value.length > MAX_DATA_ARRAY_ITEMS) {
      subset.push(`[truncated ${value.length - MAX_DATA_ARRAY_ITEMS} items]`);
    }
    return subset;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const subset = entries.slice(0, MAX_DATA_KEYS);
  const result: Record<string, unknown> = {};
  for (const [key, entryValue] of subset) {
    result[key] = pruneComplexStructures(entryValue, depth + 1);
  }
  if (entries.length > MAX_DATA_KEYS) {
    result._truncatedKeys = `[truncated ${entries.length - MAX_DATA_KEYS} keys]`;
  }
  return result;
}

function coerceRequestId(entryRequestId: unknown, headerRequestId?: string): string | undefined {
  if (typeof entryRequestId === "string" && entryRequestId.trim().length > 0) {
    return entryRequestId.trim().slice(0, 128);
  }
  const normalizedHeader = headerRequestId?.trim();
  return normalizedHeader && normalizedHeader.length > 0 ? normalizedHeader : undefined;
}

class PayloadTooLargeError extends Error {
  constructor(public size: number) {
    super(`Payload exceeded limit (${size} bytes)`);
    this.name = "PayloadTooLargeError";
  }
}

async function readBoundedJson<T>(
  request: Request,
  maxBytes: number,
): Promise<{ json: T; byteLength: number }> {
  if (request.body) {
    const { buffer, size } = await readStreamWithLimit(request.body, maxBytes);
    const text = decodeBuffer(buffer);
    return { json: JSON.parse(text) as T, byteLength: size };
  }
  const arrayBuffer = await request.arrayBuffer();
  const size = arrayBuffer.byteLength;
  if (size > maxBytes) {
    throw new PayloadTooLargeError(size);
  }
  const text = decodeBuffer(arrayBuffer);
  return { json: JSON.parse(text) as T, byteLength: size };
}

async function readStreamWithLimit(stream: ReadableStream<Uint8Array>, maxBytes: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      received += value.byteLength;
      if (received > maxBytes) {
        throw new PayloadTooLargeError(received);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = concatChunks(chunks, received);
  return { buffer, size: received };
}

function concatChunks(chunks: Uint8Array[], totalSize: number): Uint8Array {
  if (chunks.length === 1) {
    return chunks[0].slice();
  }
  const merged = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function decodeBuffer(buffer: ArrayBuffer | Uint8Array): string {
  const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return new TextDecoder("utf-8", { fatal: true }).decode(view);
}

function getRateLimitKey(headers: Headers, internalToken: string | null): string {
  const explicitClient = headers.get(LOG_CLIENT_HEADER)?.trim();
  if (explicitClient) {
    return explicitClient.toLowerCase();
  }
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) {
    return forwarded.toLowerCase();
  }
  const connectingIp = headers.get("cf-connecting-ip")?.trim();
  if (connectingIp) {
    return connectingIp.toLowerCase();
  }
  const headerRequestId = headers.get(REQUEST_ID_HEADER)?.trim();
  if (headerRequestId) {
    return headerRequestId.toLowerCase();
  }
  return internalToken ?? "anonymous";
}

function consumeRateLimit(key: string, now = Date.now()): { allowed: boolean; count: number } {
  const existing = rateLimiter.get(key);
  if (!existing || now - existing.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimiter.set(key, { count: 1, windowStart: now });
    return { allowed: true, count: 1 };
  }
  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, count: existing.count };
  }
  existing.count += 1;
  return { allowed: true, count: existing.count };
}

const logRouteTestUtils = {
  resetRateLimiter() {
    rateLimiter.clear();
  },
  RATE_LIMIT_MAX_REQUESTS,
};

declare global {
  var __logRouteTestUtils: typeof logRouteTestUtils | undefined;
}

if (process.env.NODE_ENV !== "production") {
  globalThis.__logRouteTestUtils = logRouteTestUtils;
}
