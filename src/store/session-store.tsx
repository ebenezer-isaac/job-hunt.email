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
  mode: ChatMode;
  sourceDocuments: {
    originalCV: string;
    extensiveCV: string;
    cvStrategy: string;
    coverLetterStrategy: string;
    coldEmailStrategy: string;
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
    setIsGenerating: (value: boolean) => void;
    setGeneratedDocuments: (sessionId: string | null, artifacts: GenerationArtifacts | null) => void;
    setMode: (mode: ChatMode) => void;
    updateSourceDocument: (docType: keyof SessionStoreState["sourceDocuments"], value: string) => void;
    setSessionStatus: (sessionId: string, status: SessionStatus) => void;
    touchSessionTimestamp: (sessionId: string, timestamp?: string) => void;
    setQuota: (quota: SessionStoreState["quota"]) => void;
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
    mergedMap.set(message.id, message);
  }
  return Array.from(mergedMap.values()).sort((a, b) => safeTimestamp(a.timestamp) - safeTimestamp(b.timestamp));
}

function safeTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

type ArtifactPreviews = {
  cv?: string;
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
  return {
    cv: typeof previewsRecord.cv === "string" ? previewsRecord.cv : undefined,
    coverLetter: typeof previewsRecord.coverLetter === "string" ? previewsRecord.coverLetter : undefined,
    coldEmail: typeof previewsRecord.coldEmail === "string" ? previewsRecord.coldEmail : undefined,
    coldEmailSubject:
      typeof previewsRecord.coldEmailSubject === "string" ? previewsRecord.coldEmailSubject : undefined,
    coldEmailBody:
      typeof previewsRecord.coldEmailBody === "string" ? previewsRecord.coldEmailBody : undefined,
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
  return createStore<SessionStoreState>((set, get) => ({
    sessions: initialState?.sessions ?? [],
    currentSessionId: initialState?.currentSessionId ?? initialState?.sessions?.[0]?.id ?? null,
    chatHistory: initialState?.chatHistory ?? initialState?.sessions?.[0]?.chatHistory ?? [],
    isGenerating: initialState?.isGenerating ?? false,
    generatedDocuments:
      initialState?.generatedDocuments ?? buildArtifactsFromSession(initialState?.sessions?.[0]) ?? null,
    mode: initialState?.mode ?? "standard",
    sourceDocuments: initialState?.sourceDocuments ?? {
      originalCV: "",
      extensiveCV: "",
      cvStrategy: "",
      coverLetterStrategy: "",
      coldEmailStrategy: "",
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
          const artifacts = activeSession ? buildArtifactsFromSession(activeSession) : null;
          const nextMode = extractSessionMode(activeSession);
          const nextState: Partial<SessionStoreState> = {
            sessions: merged,
            generatedDocuments: artifacts ?? state.generatedDocuments,
            chatHistory: activeSession?.chatHistory ?? state.chatHistory,
          };
          if (nextMode && nextMode !== state.mode) {
            persistMode(nextMode);
            nextState.mode = nextMode;
          }
          return nextState;
        });
      },
      selectSession: (sessionId) => {
        const { sessions } = get();
        const active = sessions.find((session) => session.id === sessionId) ?? null;
        const sessionMode = active ? extractSessionMode(active) : null;
        const resolvedMode = sessionMode ?? get().mode;
        set({
          currentSessionId: sessionId,
          chatHistory: active?.chatHistory ?? [],
          generatedDocuments: buildArtifactsFromSession(active),
          mode: resolvedMode,
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
      setIsGenerating: (value) => set({ isGenerating: value }),
      setGeneratedDocuments: (sessionId, artifacts) =>
        set((state) => {
          if (sessionId && sessionId !== state.currentSessionId) {
            return state;
          }
          return { generatedDocuments: artifacts };
        }),
      setMode: (mode) => {
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
      setSessionStatus: (sessionId, status) =>
        set((state) => {
          const index = state.sessions.findIndex((session) => session.id === sessionId);
          if (index === -1) {
            return state;
          }
          const updatedSessions = state.sessions.map((session, idx) =>
            idx === index ? { ...session, status } : session,
          );
          return {
            sessions: updatedSessions,
          };
        }),
      touchSessionTimestamp: (sessionId, timestamp) =>
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
