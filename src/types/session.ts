import type { GeneratedFile, SessionStatus } from "@/lib/session";

export type SerializableChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  level?: "info" | "success" | "error";
  isMarkdown?: boolean;
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
