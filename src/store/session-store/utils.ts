import type { ChatMessage, ChatMode, ClientSession } from "./types";

export function extractSessionMode(session?: ClientSession | null): ChatMode | null {
  const value = session?.metadata?.mode;
  if (value === "cold_outreach" || value === "standard") {
    return value;
  }
  return null;
}

export function persistMode(mode: ChatMode) {
  if (typeof window !== "undefined") {
    localStorage.setItem("chatMode", mode);
  }
}

export function safeTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function effectiveTimestamp(message: ChatMessage): number {
  const source = message.metadata?.clientTimestamp ?? message.timestamp;
  return safeTimestamp(source);
}

export function mergeChatHistories(serverHistory: ChatMessage[], existingHistory: ChatMessage[]): ChatMessage[] {
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
    const duplicateId = Array.from(mergedMap.values()).find((existing) => {
      if (existing.id === message.id) return false;
      const isLog = existing.metadata?.kind === "log" || message.metadata?.kind === "log";
      if (!isLog) return false;
      return (
        existing.content === message.content &&
        existing.role === message.role &&
        existing.level === message.level &&
        Math.abs(effectiveTimestamp(existing) - effectiveTimestamp(message)) < 10000
      );
    })?.id;

    if (duplicateId) {
      mergedMap.delete(duplicateId);
    }
    mergedMap.set(message.id, message);
  }
  return Array.from(mergedMap.values()).sort((a, b) => effectiveTimestamp(a) - effectiveTimestamp(b));
}

export function appendOrMerge(history: ChatMessage[], message: ChatMessage): ChatMessage[] {
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

export function mergeContent(existing: string, addition: string): string {
  if (!addition) {
    return existing;
  }
  if (!existing) {
    return addition;
  }
  return `${existing}\n${addition}`;
}

export function sessionSortValue(session: { metadata?: Record<string, unknown>; createdAt: string }) {
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
