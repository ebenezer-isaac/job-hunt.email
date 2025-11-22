import "server-only";
import { Timestamp } from "firebase-admin/firestore";

import { type LogEntry, type LogLevel } from "@/lib/logging/types";
import { getRequestLogContext } from "@/lib/logging/request-log-registry";
import { getActiveRequestId } from "@/lib/logging/request-id-context";
import { env } from "@/env";
import { getDb } from "@/lib/firebase-admin";

const FIRESTORE_COLLECTION = "appLogs";

type FirestoreLogDocument = {
  severity: "DEBUG" | "INFO" | "WARNING" | "ERROR";
  scope: string;
  message: string;
  timestamp: string;
  requestId?: string;
  data?: unknown;
  context?: unknown;
  environment: string;
  createdAt: Timestamp;
};

function buildFirestoreDocument(
  payload: Record<string, unknown>,
  severity: FirestoreLogDocument["severity"],
  timestamp: Date,
  requestId?: string,
): FirestoreLogDocument {
  const doc: FirestoreLogDocument = {
    severity,
    scope: String(payload.scope ?? "unknown"),
    message: String(payload.message ?? ""),
    timestamp: timestamp.toISOString(),
    environment: env.NODE_ENV,
    createdAt: Timestamp.now(),
  };
  if (requestId) {
    doc.requestId = requestId;
  }
  const cleanedData = pruneUndefined(payload.data);
  if (cleanedData !== undefined) {
    doc.data = cleanedData;
  }
  const cleanedContext = pruneUndefined(payload.context);
  if (cleanedContext !== undefined) {
    doc.context = cleanedContext;
  }
  return doc;
}

function pruneUndefined(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const pruned = value
      .map((item) => pruneUndefined(item))
      .filter((item) => item !== undefined);
    return pruned;
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = pruneUndefined(val);
      if (cleaned !== undefined) {
        result[key] = cleaned;
      }
    }
    return result;
  }
  return value;
}

let firestoreFailureCount = 0;

async function persistLogToFirestore(doc: FirestoreLogDocument): Promise<void> {
  try {
    const db = getDb();
    await db.collection(FIRESTORE_COLLECTION).add(doc);
    if (firestoreFailureCount > 0) {
      console.warn(
        JSON.stringify({
          severity: "INFO",
          scope: "firestore-log-writer",
          message: `Logging pipeline recovered after ${firestoreFailureCount} Firestore failures`,
          timestamp: new Date().toISOString(),
        }),
      );
      firestoreFailureCount = 0;
    }
  } catch (error) {
    firestoreFailureCount += 1;
    console.error(
      JSON.stringify({
        severity: "ERROR",
        scope: "firestore-log-writer",
        message: `Firestore logging failure #${firestoreFailureCount}`,
        timestamp: new Date().toISOString(),
        data: {
          error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
        },
      }),
    );
  }
}

function serializeData(data: unknown): unknown {
  if (data === undefined) {
    return undefined;
  }
  if (data instanceof Error) {
    return {
      name: data.name,
      message: data.message,
      stack: data.stack,
    };
  }
  if (typeof data === "bigint") {
    return data.toString();
  }
  return data;
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

export async function appendLogEntry(entry: LogEntry): Promise<void> {
  const resolvedRequestId = entry.requestId ?? getActiveRequestId();
  
  const payload: Record<string, unknown> = {
    message: entry.message,
    scope: entry.scope,
  };

  if (resolvedRequestId) {
    payload.requestId = resolvedRequestId;
    const context = getRequestLogContext(resolvedRequestId);
    if (context) {
      payload.context = context;
    }
  }

  if (entry.data !== undefined) {
    payload.data = serializeData(entry.data);
  }

  const severity = levelToSeverity(entry.level);
  const logTimestamp = new Date(entry.timestamp);

  // --- DUAL LOGGING STRATEGY ---
  // 1. Write to Stdout (Reliable, Synchronous-ish)
  // We output structured JSON so Cloud Run picks it up.
  // This acts as a fallback if the API call is throttled or fails.
  const jsonLog = {
    ...payload,
    severity,
    timestamp: logTimestamp,
    "logging.googleapis.com/trace": resolvedRequestId 
      ? `projects/${env.FIREBASE_PROJECT_ID}/traces/${resolvedRequestId}` 
      : undefined,
  };
  
  // Use console.error for errors to ensure they go to stderr (which Cloud Run also captures)
  if (severity === "ERROR") {
    console.error(JSON.stringify(jsonLog));
  } else {
    console.log(JSON.stringify(jsonLog));
  }

  const firestoreDoc = buildFirestoreDocument(payload, severity, logTimestamp, resolvedRequestId);
  await persistLogToFirestore(firestoreDoc);
}
