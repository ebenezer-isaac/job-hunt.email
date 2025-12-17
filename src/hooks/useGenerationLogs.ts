"use client";

import { useEffect, useRef, useState } from "react";
import {
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";

import { createDebugLogger } from "@/lib/debug-logger";
import { firebaseApp } from "@/lib/firebase-client";
import type { GenerationLogEntry, GenerationRun, GenerationStatus } from "@/components/chat/generation";

const RUN_COLLECTION = "generationLogs";
const ENTRIES_COLLECTION = "entries";
const logger = createDebugLogger("useGenerationLogs");

function coerceStatus(value: unknown): GenerationStatus {
  if (value === "in-progress" || value === "completed" || value === "failed") {
    return value;
  }
  return "pending";
}

function coerceTimestamp(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

function coerceIndex(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function handleSnapshotError(context: string, error: FirestoreError, sessionId: string, generationId?: string) {
  logger.warn(context, {
    sessionId,
    generationId: generationId ?? null,
    code: error.code,
    message: error.message,
    name: error.name,
  });
}

export function useGenerationLogs(sessionId: string | null): { runs: GenerationRun[]; isLoading: boolean } {
  const [runs, setRuns] = useState<GenerationRun[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const entryUnsubRef = useRef<Record<string, Unsubscribe>>({});

  useEffect(() => {
    const entryUnsubscribers = entryUnsubRef.current;
    Object.values(entryUnsubscribers).forEach((unsubscribe) => unsubscribe());
    entryUnsubRef.current = {};
    setRuns([]);
    setIsLoading(Boolean(sessionId));

    if (!sessionId) {
      return undefined;
    }

    const db = getFirestore(firebaseApp);
    const runsRef = collection(db, "sessions", sessionId, RUN_COLLECTION);
    const runsQuery = query(runsRef, orderBy("index", "asc"));

    const subscribeToEntries = (generationId: string): Unsubscribe => {
      const entriesRef = collection(db, "sessions", sessionId, RUN_COLLECTION, generationId, ENTRIES_COLLECTION);
      const entriesQuery = query(entriesRef, orderBy("timestamp", "asc"));
      return onSnapshot(
        entriesQuery,
        (entrySnapshot) => {
          const logs: GenerationLogEntry[] = entrySnapshot.docs.map((doc) => {
            const data = doc.data();
            const fallbackTimestamp = new Date().toISOString();
            return {
              id: typeof data.id === "string" && data.id ? data.id : doc.id,
              content: typeof data.content === "string" ? data.content : String(data.content ?? ""),
              timestamp: coerceTimestamp(data.timestamp, fallbackTimestamp),
              level: data.level === "success" || data.level === "warning" || data.level === "error" ? data.level : "info",
            } satisfies GenerationLogEntry;
          });
          setRuns((previous) =>
            previous.map((run) =>
              run.id === generationId
                ? {
                    ...run,
                    logs,
                    lastUpdatedAt: logs[logs.length - 1]?.timestamp ?? run.lastUpdatedAt,
                  }
                : run,
            ),
          );
        },
        (error) => handleSnapshotError("Failed to stream generation log entries", error, sessionId, generationId),
      );
    };

    const unsubscribeRuns = onSnapshot(
      runsQuery,
      (snapshot) => {
        setIsLoading(false);
        const baseRuns = snapshot.docs.map((doc, index) => {
          const data = doc.data();
          const startedAt = coerceTimestamp(data.startedAt, new Date().toISOString());
          const lastUpdatedAt = coerceTimestamp(data.lastUpdatedAt, startedAt);
          const generationId = typeof data.generationId === "string" && data.generationId ? data.generationId : doc.id;
          const status = coerceStatus(data.status);
          const summaryText = typeof data.summary === "string" ? data.summary : undefined;
          const summaryLevel: GenerationLogEntry["level"] | undefined =
            status === "failed" ? "error" : status === "completed" ? "success" : undefined;

          return {
            id: generationId,
            generationId,
            index: coerceIndex(data.index, index + 1),
            logs: [],
            summary: summaryText
              ? {
                  id: `${generationId}-summary`,
                  content: summaryText,
                  timestamp: lastUpdatedAt,
                  level: summaryLevel,
                }
              : undefined,
            startedAt,
            lastUpdatedAt,
            hasStableId: true,
            status,
          } satisfies GenerationRun;
        });

        setRuns((previous) => {
          const previousLogs = new Map(previous.map((run) => [run.id, run.logs]));
          return baseRuns.map((run) => ({
            ...run,
            logs: previousLogs.get(run.id) ?? [],
          }));
        });

        const nextIds = new Set(baseRuns.map((run) => run.id));
        Object.entries(entryUnsubRef.current).forEach(([runId, unsubscribe]) => {
          if (!nextIds.has(runId)) {
            unsubscribe();
            delete entryUnsubRef.current[runId];
          }
        });
        baseRuns.forEach((run) => {
          if (!entryUnsubRef.current[run.id]) {
            entryUnsubRef.current[run.id] = subscribeToEntries(run.id);
          }
        });
      },
      (error) => {
        setIsLoading(false);
        handleSnapshotError("Failed to stream generation runs", error, sessionId);
      },
    );

    return () => {
      unsubscribeRuns();
      Object.values(entryUnsubRef.current).forEach((unsubscribe) => unsubscribe());
      entryUnsubRef.current = {};
      setRuns([]);
      setIsLoading(false);
    };
  }, [sessionId]);

  return { runs, isLoading };
}
