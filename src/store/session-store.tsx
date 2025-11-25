'use client';

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import type { GenerationArtifacts } from "@/hooks/useStreamableValue";
import type { SerializableChatMessage, SerializableSession } from "@/types/session";
import type { SessionStatus } from "@/lib/session";

export type ChatMode = "standard" | "cold_outreach";

export type ChatMessage = SerializableChatMessage;
export type ClientSession = SerializableSession;

export type SessionStoreState = {
  sessions: ClientSession[];
  currentSessionId: string | null;
  chatHistory: ChatMessage[];
  isGenerating: boolean;
  generatedDocuments: GenerationArtifacts | null;
  sessionArtifacts: Record<string, GenerationArtifacts | null>;
  sessionGenerating: Record<string, boolean>;
  pendingGlobalGeneration: boolean;
  mode: ChatMode;
  sourceDocuments: {
    originalCV: string;
    extensiveCV: string;
    cvStrategy: string;
    coverLetterStrategy: string;
    coldEmailStrategy: string;
    reconStrategy: string;
  };
  quota: {
    totalAllocated: number;
    remaining: number;
    onHold: number;
  } | null;
  actions: {
    setSessions: (sessions: ClientSession[]) => void;
    selectSession: (sessionId: string | null) => void;
    setChatHistory: (history: ChatMessage[]) => void;
    appendChatMessage: (sessionId: string, message: ChatMessage) => void;
    setIsGenerating: (sessionId: string | null, value: boolean) => void;
    setGeneratedDocuments: (sessionId: string | null, artifacts: GenerationArtifacts | null) => void;
    setMode: (mode: ChatMode) => void;
    updateSourceDocument: (docType: keyof SessionStoreState["sourceDocuments"], value: string) => void;
    setSessionStatus: (sessionId: string, status: SessionStatus) => void;
    touchSessionTimestamp: (sessionId: string, timestamp?: string) => void;
    setQuota: (quota: SessionStoreState["quota"]) => void;
    removeSession: (sessionId: string) => void;
    upsertSession: (session: ClientSession) => void;
  };
};

export type SessionStore = StoreApi<SessionStoreState>;

export type InitialSessionState = Partial<Omit<SessionStoreState, "actions">> & {
  sessions?: ClientSession[];
};

function extractSessionMode(session?: ClientSession | null): ChatMode | null {
  const value = session?.metadata?.mode;
  if (value === "cold_outreach" || value === "standard") {
    return value;
  }
  return null;
}

function persistMode(mode: ChatMode) {
  if (typeof window !== "undefined") {
    localStorage.setItem("chatMode", mode);
  }
}

function mergeChatHistories(serverHistory: ChatMessage[], existingHistory: ChatMessage[]): ChatMessage[] {
  if (!existingHistory.length) {
    return serverHistory;
  }
  if (!serverHistory.length) {
    return existingHistory;
  }
  const mergedMap = new Map<string, ChatMessage>();
  for (const message of existingHistory) {
    mergedMap.set(message.id, message);
  }
  for (const message of serverHistory) {
    // Check for content-based duplicates for logs where IDs might differ
    // (Client generates random ID, Server generates timestamp-based ID)
    const duplicateId = Array.from(mergedMap.values()).find((existing) => {
      if (existing.id === message.id) return false; // ID match handled by map set
      
      // Only dedupe logs or system messages, not user prompts (unless exact match)
      // User prompts should have exact ID match via appendLogAction
      
      const isLog = existing.metadata?.kind === "log" || message.metadata?.kind === "log";
      if (!isLog) return false;

      return (
        existing.content === message.content &&
        existing.role === message.role &&
        existing.level === message.level &&
        Math.abs(effectiveTimestamp(existing) - effectiveTimestamp(message)) < 10000 // 10s window
      );
    })?.id;

    if (duplicateId) {
      mergedMap.delete(duplicateId);
    }
    mergedMap.set(message.id, message);
  }
  return Array.from(mergedMap.values()).sort((a, b) => effectiveTimestamp(a) - effectiveTimestamp(b));
}

function safeTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function effectiveTimestamp(message: ChatMessage): number {
  const source = message.metadata?.clientTimestamp ?? message.timestamp;
  return safeTimestamp(source);
}

type ArtifactPreviews = {
  cv?: string;
  cvChangeSummary?: string;
  coverLetter?: string;
  coldEmail?: string;
  coldEmailSubject?: string;
  coldEmailBody?: string;
};

function extractArtifactPreviews(metadata?: Record<string, unknown>): ArtifactPreviews {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }
  const previewsRaw = (metadata as Record<string, unknown>)["artifactPreviews"];
  if (!previewsRaw || typeof previewsRaw !== "object") {
    return {};
  }
  const previewsRecord = previewsRaw as Record<string, unknown>;
  const readPreview = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const candidate = previewsRecord[key];
      if (typeof candidate !== "string") {
        continue;
      }
      const trimmed = candidate.trim();
      if (!trimmed || trimmed.startsWith("[REDACTED")) {
        continue;
      }
      return trimmed;
    }
    return undefined;
  };
  return {
    cv: readPreview("cvPreview", "cv"),
    cvChangeSummary: readPreview("cvChangeSummary"),
    coverLetter: readPreview("coverLetterPreview", "coverLetter"),
    coldEmail: readPreview("coldEmailPreview", "coldEmail"),
    coldEmailSubject: readPreview("coldEmailSubjectPreview", "coldEmailSubject"),
    coldEmailBody: readPreview("coldEmailBodyPreview", "coldEmailBody"),
  };
}

function readNumber(metadata: Record<string, unknown> | undefined, key: string): number | undefined {
  if (!metadata) {
    return undefined;
  }
  const value = metadata[key];
  return typeof value === "number" ? value : undefined;
}

function readStringArray(metadata: Record<string, unknown> | undefined, key: string): string[] | undefined {
  if (!metadata) {
    return undefined;
  }
  const value = metadata[key];
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((entry) => typeof entry === "string") as string[];
}

function buildArtifactsFromSession(session?: ClientSession | null): GenerationArtifacts | null {
  if (!session) {
    return null;
  }
  const files = session.generatedFiles ?? {};
  const previews = extractArtifactPreviews(session.metadata);
  const detectedEmails = readStringArray(session.metadata, "detectedEmails");
  const coldEmailSubject = typeof session.metadata?.coldEmailSubject === "string" ? session.metadata?.coldEmailSubject : undefined;
  const coldEmailBody = typeof session.metadata?.coldEmailBody === "string" ? session.metadata?.coldEmailBody : undefined;
  const coldEmailTo = typeof session.metadata?.coldEmailTo === "string" ? session.metadata?.coldEmailTo : undefined;
  const artifacts: GenerationArtifacts = {};

  if (files.cv) {
    artifacts.cv = {
      content: previews.cv ?? "",
      downloadUrl: files.cv.url,
      storageKey: files.cv.key,
      mimeType: files.cv.mimeType,
      metadata: { label: files.cv.label },
      pageCount: readNumber(session.metadata, "cvPageCount") ?? null,
      changeSummary: previews.cvChangeSummary,
    };
  }
  if (files.coverLetter) {
    artifacts.coverLetter = {
      content: previews.coverLetter ?? "",
      downloadUrl: files.coverLetter.url,
      storageKey: files.coverLetter.key,
      mimeType: files.coverLetter.mimeType,
      metadata: { label: files.coverLetter.label },
    };
  }
  if (files.coldEmail) {
    artifacts.coldEmail = {
      content: previews.coldEmail ?? "",
      downloadUrl: files.coldEmail.url,
      storageKey: files.coldEmail.key,
      mimeType: files.coldEmail.mimeType,
      metadata: { label: files.coldEmail.label },
      emailAddresses: detectedEmails,
      subject: previews.coldEmailSubject ?? coldEmailSubject,
      body: previews.coldEmailBody ?? coldEmailBody ?? previews.coldEmail,
      toAddress: coldEmailTo,
    };
  }

  return Object.keys(artifacts).length ? artifacts : null;
}

function createSessionStore(initialState?: InitialSessionState) {
  const initialSessions = initialState?.sessions ?? [];
  const initialSessionId = initialState?.currentSessionId ?? initialSessions[0]?.id ?? null;
  const initialArtifactsMap = initialSessions.reduce<Record<string, GenerationArtifacts | null>>((acc, session) => {
    acc[session.id] = buildArtifactsFromSession(session);
    return acc;
  }, {});
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
    sourceDocuments: initialState?.sourceDocuments ?? {
      originalCV: "",
      extensiveCV: "",
      cvStrategy: "",
      coverLetterStrategy: "",
      coldEmailStrategy: "",
      reconStrategy: "",
    },
    quota: (initialState as InitialSessionState & { quota?: SessionStoreState["quota"] })?.quota ?? null,
    actions: {
      setSessions: (sessions) => {
        set((state) => {
          const merged = sessions.map((session) => {
            const existing = state.sessions.find((item) => item.id === session.id);
            if (!existing) {
              return session;
            }
            const mergedHistory = mergeChatHistories(session.chatHistory, existing.chatHistory);
            return {
              ...session,
              chatHistory: mergedHistory,
            };
          });
          const activeSessionId = state.currentSessionId;
          const activeSession = activeSessionId ? merged.find((item) => item.id === activeSessionId) : null;
          const artifactsBySession = { ...state.sessionArtifacts };
          const generationBySession = { ...state.sessionGenerating };

          merged.forEach((session) => {
            artifactsBySession[session.id] = buildArtifactsFromSession(session);
            const shouldGenerate = session.status === "processing";
            if (generationBySession[session.id] !== shouldGenerate) {
              generationBySession[session.id] = shouldGenerate;
            }
          });

          const artifacts = activeSessionId ? artifactsBySession[activeSessionId] ?? null : null;
          const nextMode = extractSessionMode(activeSession);
          const nextState: Partial<SessionStoreState> = {
            sessions: merged,
            sessionArtifacts: artifactsBySession,
            sessionGenerating: generationBySession,
            generatedDocuments: artifacts ?? state.generatedDocuments,
            chatHistory: activeSession?.chatHistory ?? state.chatHistory,
            isGenerating: activeSessionId ? Boolean(generationBySession[activeSessionId]) : state.isGenerating,
          };
          if (nextMode && nextMode !== state.mode) {
            persistMode(nextMode);
            nextState.mode = nextMode;
          }
          return nextState;
        });
      },
      selectSession: (sessionId) => {
        const state = get();
        const active = state.sessions.find((session) => session.id === sessionId) ?? null;
        const sessionMode = active ? extractSessionMode(active) : null;
        const resolvedMode = sessionMode ?? state.mode;
        const pendingCarry = state.currentSessionId === null && state.pendingGlobalGeneration;
        const artifactsFromMap = sessionId ? state.sessionArtifacts[sessionId] : null;
        const artifacts = artifactsFromMap ?? buildArtifactsFromSession(active);
        const isGeneratingForSession = sessionId
          ? state.sessionGenerating[sessionId] ?? (pendingCarry ? state.isGenerating : false)
          : false;

        set({
          currentSessionId: sessionId,
          chatHistory: active?.chatHistory ?? [],
          generatedDocuments: artifacts ?? null,
          mode: resolvedMode,
          isGenerating: isGeneratingForSession,
          pendingGlobalGeneration: sessionId ? state.pendingGlobalGeneration : false,
        });
        if (sessionMode) {
          persistMode(resolvedMode);
        }
      },
      setChatHistory: (history) =>
        set((state) => {
          const updatedSessions = state.currentSessionId
            ? state.sessions.map((session) =>
                session.id === state.currentSessionId ? { ...session, chatHistory: history } : session,
              )
            : state.sessions;
          return {
            chatHistory: history,
            sessions: updatedSessions,
          };
        }),
      appendChatMessage: (sessionId, message) => {
        set((state) => {
          let nextChatHistory = state.chatHistory;
          let matched = false;
          const sessions = state.sessions.map((session) => {
            if (session.id !== sessionId) {
              return session;
            }
            matched = true;
            const updatedHistory = appendOrMerge(session.chatHistory, message);
            if (sessionId === state.currentSessionId) {
              nextChatHistory = updatedHistory;
            }
            return { ...session, chatHistory: updatedHistory };
          });
          if (!matched) {
            return state;
          }
          return { chatHistory: nextChatHistory, sessions };
        });
      },
      setIsGenerating: (sessionId: string | null, value: boolean) =>
        set((state) => {
          if (!sessionId) {
            return {
              isGenerating: value,
              pendingGlobalGeneration: value,
            };
          }
          const sessionGenerating = { ...state.sessionGenerating, [sessionId]: value };
          const affectsCurrent = state.currentSessionId === sessionId;
          return {
            sessionGenerating,
            isGenerating: affectsCurrent ? value : state.isGenerating,
            pendingGlobalGeneration: false,
          };
        }),
      setGeneratedDocuments: (sessionId: string | null, artifacts: GenerationArtifacts | null) =>
        set((state) => {
          if (!sessionId) {
            return { generatedDocuments: artifacts };
          }
          const artifactsBySession = { ...state.sessionArtifacts, [sessionId]: artifacts };
          return {
            sessionArtifacts: artifactsBySession,
            generatedDocuments: state.currentSessionId === sessionId ? artifacts : state.generatedDocuments,
          };
        }),
      setMode: (mode: ChatMode) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("chatMode", mode);
        }
        set({ mode });
      },
      updateSourceDocument: (docType, value) => {
        set((state) => ({
          sourceDocuments: {
            ...state.sourceDocuments,
            [docType]: value,
          },
        }));
      },
      setSessionStatus: (sessionId: string, status: SessionStatus) =>
        set((state) => {
          const index = state.sessions.findIndex((session) => session.id === sessionId);
          if (index === -1) {
            return state;
          }
          const updatedSessions = state.sessions.map((session, idx) =>
            idx === index ? { ...session, status } : session,
          );
          const sessionGenerating = { ...state.sessionGenerating, [sessionId]: status === "processing" };
          return {
            sessions: updatedSessions,
            sessionGenerating,
            isGenerating:
              state.currentSessionId === sessionId ? (status === "processing") : state.isGenerating,
          };
        }),
      touchSessionTimestamp: (sessionId: string, timestamp?: string) =>
        set((state) => {
          const iso = timestamp ?? new Date().toISOString();
          const updatedSessions = state.sessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  metadata: {
                    ...session.metadata,
                    lastGeneratedAt: iso,
                  },
                }
              : session,
          );
          return { sessions: updatedSessions };
        }),
      setQuota: (quota) => set({ quota }),
      removeSession: (sessionId) =>
        set((state) => {
          if (!state.sessions.some((session) => session.id === sessionId)) {
            return state;
          }
          const sessions = state.sessions.filter((session) => session.id !== sessionId);
          const sessionArtifacts = { ...state.sessionArtifacts };
          delete sessionArtifacts[sessionId];
          const sessionGenerating = { ...state.sessionGenerating };
          delete sessionGenerating[sessionId];
          const updates: Partial<SessionStoreState> = {
            sessions,
            sessionArtifacts,
            sessionGenerating,
          };
          if (state.currentSessionId === sessionId) {
            const nextActive = sessions[0] ?? null;
            updates.currentSessionId = nextActive?.id ?? null;
            updates.chatHistory = nextActive?.chatHistory ?? [];
            updates.generatedDocuments = nextActive ? sessionArtifacts[nextActive.id] ?? null : null;
            updates.isGenerating = nextActive ? Boolean(sessionGenerating[nextActive.id]) : false;
          }
          return updates;
        }),
      upsertSession: (session) =>
        set((state) => {
          const artifacts = buildArtifactsFromSession(session);
          const list = state.sessions.slice();
          const existingIndex = list.findIndex((entry) => entry.id === session.id);
          if (existingIndex >= 0) {
            list[existingIndex] = session;
          } else {
            list.unshift(session);
          }
          list.sort((a, b) => sessionSortValue(b) - sessionSortValue(a));

          const sessionArtifacts = { ...state.sessionArtifacts, [session.id]: artifacts };
          const sessionGenerating = {
            ...state.sessionGenerating,
            [session.id]: session.status === "processing",
          };
          const updates: Partial<SessionStoreState> = {
            sessions: list,
            sessionArtifacts,
            sessionGenerating,
          };
          if (state.currentSessionId === session.id) {
            updates.chatHistory = session.chatHistory;
            updates.generatedDocuments = artifacts ?? null;
            updates.isGenerating = session.status === "processing";
          }
          return updates;
        }),
    },
  }));
}

function appendOrMerge(history: ChatMessage[], message: ChatMessage): ChatMessage[] {
  if (!history.length) {
    return [message];
  }
  const last = history[history.length - 1];
  if (!shouldMerge(last, message)) {
    return [...history, message];
  }
  const merged: ChatMessage = {
    ...last,
    content: mergeContent(last.content, message.content),
    timestamp: message.timestamp,
  };
  const nextHistory = history.slice(0, -1);
  nextHistory.push(merged);
  return nextHistory;
}

function shouldMerge(previous: ChatMessage, incoming: ChatMessage): boolean {
  if (incoming.role === "user") {
    return false;
  }
  if (previous.mergeDisabled || incoming.mergeDisabled) {
    return false;
  }
  const previousKind = previous.metadata?.kind ?? null;
  const incomingKind = incoming.metadata?.kind ?? null;
  if (previousKind === "log" || incomingKind === "log") {
    return false;
  }
  return (
    previous.role === incoming.role &&
    (previous.level ?? "info") === (incoming.level ?? "info") &&
    Boolean(previous.isMarkdown) === Boolean(incoming.isMarkdown)
  );
}

function mergeContent(existing: string, addition: string): string {
  if (!addition) {
    return existing;
  }
  if (!existing) {
    return addition;
  }
  return `${existing}\n${addition}`;
}

const SessionStoreContext = createContext<SessionStore | null>(null);

function sessionSortValue(session: { metadata?: Record<string, unknown>; createdAt: string }) {
  const candidate = session.metadata?.lastGeneratedAt;
  if (typeof candidate === "string" && candidate.trim()) {
    const value = Date.parse(candidate);
    if (!Number.isNaN(value)) {
      return value;
    }
  }
  const fallback = Date.parse(session.createdAt);
  return Number.isNaN(fallback) ? 0 : fallback;
}

export function SessionStoreProvider({ children, initialState }: { children: ReactNode; initialState?: InitialSessionState }) {
  const storeRef = useRef<SessionStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createSessionStore(initialState);
  }

  useEffect(() => {
    const persisted = typeof window !== "undefined" ? (localStorage.getItem("chatMode") as ChatMode | null) : null;
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
