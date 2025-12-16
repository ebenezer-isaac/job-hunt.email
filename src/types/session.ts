import type { GeneratedFile, SessionStatus } from "@/lib/session";

export type ChatMessageKind = "prompt" | "summary" | "log" | "system";

export type ChatMessageMetadata = {
  kind?: ChatMessageKind;
  durationMs?: number;
  rawJobInput?: string;
  generationId?: string;
  clientTimestamp?: string;
} | null;

export type SerializableChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  level?: "info" | "success" | "warning" | "error";
  isMarkdown?: boolean;
  metadata?: ChatMessageMetadata;
  mergeDisabled?: boolean;
};

export type SerializableSession = {
  id: string;
  title: string;
  status: SessionStatus;
  createdAt: string;
  chatHistory: SerializableChatMessage[];
  metadata: Record<string, unknown>;
  generatedFiles: Record<string, GeneratedFile>;
};
