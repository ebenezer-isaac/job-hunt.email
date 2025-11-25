'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  getFirestore,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type FirestoreError,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseApp, firebaseAuth } from "@/lib/firebase-client";
import { useSessionStore, type ClientSession } from "@/store/session-store";
import type { SerializableChatMessage, ChatMessageKind } from "@/types/session";
import { createDebugLogger, type DebugLogger } from "@/lib/debug-logger";
import { listSessionsAction } from "@/app/actions/list-sessions";

const logger = createDebugLogger("useSessionSubscription");

type RealtimeErrorLogContext = {
  error: FirestoreError;
  details: {
    code: string;
    message: string;
    stack?: string;
    userId: string | null;
  };
  retryAttempt: number;
  retryTimerActive: boolean;
  retrySignal: number;
  authReady: boolean;
  activeSessionId: string | null;
};

function logRealtimeSubscriptionError(logger: DebugLogger, context: RealtimeErrorLogContext) {
  const { error, details, retryAttempt, retryTimerActive, retrySignal, authReady, activeSessionId } = context;
  logger.error("Realtime Firestore error trace", {
    code: details.code,
    message: details.message,
    stack: details.stack ?? "<no-stack>",
    rawError: serializeError(error),
    activeSessionId: activeSessionId ?? "<none>",
    authReady,
    retryAttempt,
    retryTimerActive,
    retrySignal,
    userId: details.userId ?? "<none>",
  });
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return String(error);
}

export function useSessionSubscription(userId: string | null) {
  const [authReady, setAuthReady] = useState(false);
  const [retrySignal, setRetrySignal] = useState(0);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const setSessions = useSessionStore((state) => state.actions.setSessions);
  const selectSession = useSessionStore((state) => state.actions.selectSession);
  const currentSessionIdRef = useRef<string | null>(currentSessionId);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const manualSessionClearedRef = useRef(false);
  const previousSessionIdRef = useRef<string | null>(currentSessionId);

  currentSessionIdRef.current = currentSessionId;

  const syncSessions = useCallback((sessions: ClientSession[]) => {
    logger.step("Syncing sessions into client store", {
      total: sessions.length,
      activeSessionId: currentSessionIdRef.current,
      sessionIds: sessions.map((session) => session.id),
    });
    setSessions(sessions);

    const activeSessionId = currentSessionIdRef.current;

    if (!activeSessionId) {
      if (!sessions.length) {
        manualSessionClearedRef.current = false;
        return;
      }
      if (manualSessionClearedRef.current) {
        logger.info("User cleared session manually, keeping blank selection");
        return;
      }
      logger.info("Selecting first session because none is active", { selectedId: sessions[0].id });
      selectSession(sessions[0].id);
      return;
    }

    const activeExists = sessions.some((session) => session.id === activeSessionId);
    if (!activeExists && sessions[0]) {
      logger.warn("Active session not found in snapshot, selecting fallback", {
        previousActive: activeSessionId,
        fallbackId: sessions[0].id,
      });
      selectSession(sessions[0].id);
    }
  }, [selectSession, setSessions]);

  const fetchFallbackSessions = useCallback(async () => {
    if (!userId) {
      logger.warn("Skipping fallback session fetch because userId is missing");
      return;
    }
    try {
      logger.step("Fetching sessions via fallback action", { userId });
      const fallbackSessions = await listSessionsAction();
      logger.data("fallback-session-count", fallbackSessions.length);
      syncSessions(fallbackSessions);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Fallback session fetch failed", { message, userId });
    }
  }, [syncSessions, userId]);

  const scheduleRetry = useCallback((code: string) => {
    if (typeof window === "undefined") {
      logger.warn("Retry requested but window is undefined - skipping", { code });
      return;
    }
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
    }
    retryAttemptRef.current += 1;
    const delay = Math.min(30000, 1000 * 2 ** (retryAttemptRef.current - 1));
    logger.warn("Retrying Firestore subscription", {
      attempt: retryAttemptRef.current,
      delayMs: delay,
      code,
      userId,
    });
    retryTimerRef.current = window.setTimeout(() => {
      setRetrySignal(Date.now());
    }, delay);
  }, [userId]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (currentSessionId) {
      manualSessionClearedRef.current = false;
    } else if (previousSessionIdRef.current) {
      manualSessionClearedRef.current = true;
    }
    previousSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      logger.warn("Auth subscription inactive", { userIdPresent: Boolean(userId), hasWindow: typeof window !== "undefined" });
      setAuthReady(false);
      return undefined;
    }

    let isMounted = true;
    logger.step("Subscribing to Firebase auth state", { userId });
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (!isMounted) {
        return;
      }
      const userMatches = Boolean(user && user.uid === userId);
      setAuthReady(userMatches);
      logger.step("Auth state change detected", {
        expectedUserId: userId,
        authUserId: user?.uid ?? null,
        userMatches,
      });
      if (!userMatches) {
        logger.warn("Waiting for Firebase auth to match subscription user", {
          expectedUserId: userId,
          currentUserId: user?.uid ?? null,
        });
      }
    });

    return () => {
      isMounted = false;
      logger.step("Unsubscribing from Firebase auth state", { userId });
      unsubscribe();
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !authReady || typeof window === "undefined") {
      // Suppress warning if just waiting for auth
      if (userId && !authReady) {
        logger.step("Waiting for auth ready state", { userId });
      } else {
        logger.warn("Firestore subscription prerequisites missing", {
          userIdPresent: Boolean(userId),
          authReady,
          hasWindow: typeof window !== "undefined",
        });
      }
      return undefined;
    }

    logger.step("Attaching Firestore listener", { userId, retrySignal });
    const db = getFirestore(firebaseApp);
    const sessionsRef = collection(db, "sessions");
    const q = query(sessionsRef, where("userId", "==", userId));

    try {
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          retryAttemptRef.current = 0;
          if (retryTimerRef.current) {
            window.clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
          }
          logger.step("Received Firestore snapshot", { docCount: snapshot.docs.length });
          const sessions = snapshot.docs
            .map(toClientSession)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          logger.data("snapshot-session-ids", sessions.map((session) => session.id));
          syncSessions(sessions);
        },
        (error) => {
          const firestoreError = error as FirestoreError;
          const details = {
            code: firestoreError?.code ?? "unknown",
            message: (error as Error)?.message ?? "Unknown Firestore error",
            userId,
            stack: firestoreError instanceof Error ? firestoreError.stack : undefined,
          };
          logger.step("Firestore listener error handler invoked", {
            code: details.code,
            retryAttempt: retryAttemptRef.current,
            retryTimerActive: Boolean(retryTimerRef.current),
          });
          logRealtimeSubscriptionError(logger, {
            error: firestoreError,
            details,
            retryAttempt: retryAttemptRef.current,
            retryTimerActive: Boolean(retryTimerRef.current),
            retrySignal,
            authReady,
            activeSessionId: currentSessionIdRef.current,
          });
          logger.error("Realtime session subscription failed", details);
          scheduleRetry(details.code);
          void fetchFallbackSessions();
        },
      );

      return () => {
        logger.step("Detaching Firestore listener", { userId });
        unsubscribe();
      };
    } catch (listenerError) {
      const message = listenerError instanceof Error ? listenerError.message : String(listenerError);
      logger.error("Failed to attach Firestore listener", { message, userId });
      scheduleRetry("listener-init-failed");
      void fetchFallbackSessions();
      return undefined;
    }
  }, [authReady, fetchFallbackSessions, scheduleRetry, syncSessions, userId, retrySignal]);
}

function toClientSession(doc: QueryDocumentSnapshot<DocumentData>): ClientSession {
  const data = doc.data();
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const createdAt = coerceDate(data.createdAt);
  const generatedFiles = (data.generatedFiles ?? {}) as ClientSession["generatedFiles"];
  return {
    id: doc.id,
    title: deriveTitle(metadata),
    status: (data.status as ClientSession["status"]) ?? "processing",
    createdAt: createdAt.toISOString(),
    chatHistory: mapChatHistory(Array.isArray(data.chatHistory) ? data.chatHistory : []),
    metadata,
    generatedFiles,
  };
}

function mapChatHistory(rawHistory: unknown[]): SerializableChatMessage[] {
  return rawHistory.map((entry, index) => {
    const record = entry as Record<string, unknown>;
    const timestampRaw = typeof record.timestamp === "string" ? record.timestamp : new Date().toISOString();
    const id = typeof record.id === "string" ? record.id : `${timestampRaw}-${index}`;
    const payload = (record.payload as Record<string, unknown>) ?? {};
    const kindRaw = payload["kind"];
    const kind = typeof kindRaw === "string" ? (kindRaw as ChatMessageKind) : undefined;
    const rawJobInput = typeof payload["rawJobInput"] === "string" ? (payload["rawJobInput"] as string) : undefined;
    const generationId = typeof payload["generationId"] === "string" ? (payload["generationId"] as string) : undefined;
    const clientTimestamp = typeof payload["clientTimestamp"] === "string" ? (payload["clientTimestamp"] as string) : undefined;
    const resolvedTimestamp = clientTimestamp ?? timestampRaw;
    const role: SerializableChatMessage["role"] = kind === "prompt" ? "user" : "assistant";

    return {
      id,
      role,
      content: String(record.message ?? ""),
      timestamp: resolvedTimestamp,
      level: (record.level as SerializableChatMessage["level"]) ?? "info",
      metadata: {
        kind: kind ?? "summary",
        rawJobInput,
        generationId,
        clientTimestamp,
      },
    };
  });
}

function deriveTitle(metadata: Record<string, unknown>): string {
  const company = typeof metadata.companyName === "string" ? metadata.companyName.trim() : "";
  const role = typeof metadata.jobTitle === "string" ? metadata.jobTitle.trim() : "";
  if (company && role) {
    return `${company} – ${role}`;
  }
  if (company) {
    return company;
  }
  return "New Conversation";
}

function coerceDate(value: unknown): Date {
  if (!value) {
    return new Date();
  }
  if (value instanceof Date) {
    return value;
  }
  const timestampCandidate = value as { toDate?: () => Date };
  if (typeof timestampCandidate.toDate === "function") {
    return timestampCandidate.toDate();
  }
  if (typeof value === "number") {
    return new Date(value);
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }
  return new Date();
}
