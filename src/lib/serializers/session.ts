import type { ChatLogEntry, SessionRecord } from "@/lib/session";
import type { SerializableSession, SerializableChatMessage, ChatMessageKind } from "@/types/session";

function deriveTitle(record: SessionRecord): string {
  const company = String(record.metadata?.companyName ?? "").trim();
  const role = String(record.metadata?.jobTitle ?? "").trim();
  if (company && role) {
    return `${company} – ${role}`;
  }
  if (company) {
    return company;
  }
  return "New Conversation";
}

function mapChatHistory(entries: ChatLogEntry[]): SerializableChatMessage[] {
  return entries.map((entry, index) => {
    const payload = entry.payload ?? {};
    const kind = (payload["kind"] as ChatMessageKind) ?? "summary";
    const rawJobInput = typeof payload["rawJobInput"] === "string" ? (payload["rawJobInput"] as string) : undefined;
    const generationId = typeof payload["generationId"] === "string" ? (payload["generationId"] as string) : undefined;

    return {
      id: entry.id ?? `${entry.timestamp}-${index}`,
      role: kind === "prompt" ? "user" : "assistant",
      content: entry.message,
      level: entry.level,
      timestamp: entry.timestamp,
      metadata: {
        kind,
        rawJobInput,
        generationId,
      },
    };
  });
}

export function serializeSession(record: SessionRecord): SerializableSession {
  return {
    id: record.id,
    title: deriveTitle(record),
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    chatHistory: mapChatHistory(record.chatHistory ?? []),
    metadata: record.metadata ?? {},
    generatedFiles: record.generatedFiles ?? {},
  };
}

export function serializeSessions(records: SessionRecord[]): SerializableSession[] {
  return records.map(serializeSession);
}
