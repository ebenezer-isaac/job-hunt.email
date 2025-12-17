import type { StoreApi } from "zustand";
import type { GenerationArtifacts } from "@/hooks/useStreamableValue";
import type { SessionStatus } from "@/lib/session";
import type { SerializableChatMessage, SerializableSession } from "@/types/session";

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
    coverLetter: string;
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
