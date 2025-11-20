import type { ChatLogEntry, SessionRecord } from "@/lib/session";
import type { SerializableSession, SerializableChatMessage } from "@/types/session";

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
  return entries.map((entry, index) => ({
    id: `${entry.timestamp}-${index}`,
    role: "assistant",
    content: entry.message,
    level: entry.level,
    timestamp: entry.timestamp,
  }));
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
