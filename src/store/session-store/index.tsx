"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { createStore, useStore } from "zustand";
import { buildArtifactsFromSession } from "./artifacts";
import { createSessionActions } from "./actions";
import type { InitialSessionState, SessionStore, SessionStoreState } from "./types";

export type { ChatMessage, ChatMode, ClientSession, SessionStoreState, SessionStore, InitialSessionState } from "./types";

function createSessionStore(initialState?: InitialSessionState) {
  const initialSessions = initialState?.sessions ?? [];
  const initialSessionId = initialState?.currentSessionId ?? initialSessions[0]?.id ?? null;
  const initialArtifactsMap = initialSessions.reduce<Record<string, ReturnType<typeof buildArtifactsFromSession>>>(
    (acc, session) => {
      acc[session.id] = buildArtifactsFromSession(session);
      return acc;
    },
    {},
  );
  const initialArtifacts = initialState?.generatedDocuments ?? (initialSessionId ? initialArtifactsMap[initialSessionId] ?? null : null);
  const initialGeneratingMap: Record<string, boolean> = {};
  if (initialSessionId && initialState?.isGenerating) {
    initialGeneratingMap[initialSessionId] = true;
  }

  return createStore<SessionStoreState>((set, get) => ({
    sessions: initialSessions,
    currentSessionId: initialSessionId,
    chatHistory:
      initialState?.chatHistory ??
      (initialSessionId
        ? initialSessions.find((session) => session.id === initialSessionId)?.chatHistory ?? []
        : initialSessions[0]?.chatHistory ?? []),
    isGenerating: initialState?.isGenerating ?? false,
    generatedDocuments: initialArtifacts ?? null,
    sessionArtifacts: initialArtifactsMap,
    sessionGenerating: initialGeneratingMap,
    pendingGlobalGeneration: false,
    mode: initialState?.mode ?? "standard",
    sourceDocuments: {
      originalCV: initialState?.sourceDocuments?.originalCV ?? "",
      extensiveCV: initialState?.sourceDocuments?.extensiveCV ?? "",
      coverLetter: initialState?.sourceDocuments?.coverLetter ?? "",
      cvStrategy: initialState?.sourceDocuments?.cvStrategy ?? "",
      coverLetterStrategy: initialState?.sourceDocuments?.coverLetterStrategy ?? "",
      coldEmailStrategy: initialState?.sourceDocuments?.coldEmailStrategy ?? "",
      reconStrategy: initialState?.sourceDocuments?.reconStrategy ?? "",
    },
    quota: (initialState as InitialSessionState & { quota?: SessionStoreState["quota"] })?.quota ?? null,
    actions: createSessionActions(set, get),
  }));
}

const SessionStoreContext = createContext<SessionStore | null>(null);

export function SessionStoreProvider({ children, initialState }: { children: ReactNode; initialState?: InitialSessionState }) {
  const storeRef = useRef<SessionStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createSessionStore(initialState);
  }

  useEffect(() => {
    const persisted = typeof window !== "undefined" ? (localStorage.getItem("chatMode") as SessionStoreState["mode"] | null) : null;
    if (persisted && storeRef.current) {
      storeRef.current.setState({ mode: persisted });
    }
  }, []);

  return <SessionStoreContext.Provider value={storeRef.current}>{children}</SessionStoreContext.Provider>;
}

export function useSessionStore<T>(selector: (state: SessionStoreState) => T): T {
  const store = useContext(SessionStoreContext);
  if (!store) {
    throw new Error("useSessionStore must be used within SessionStoreProvider");
  }
  return useStore(store, selector);
}
