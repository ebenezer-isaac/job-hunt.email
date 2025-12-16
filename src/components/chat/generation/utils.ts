import type { ChatMessage } from "@/store/session-store";
import type { GenerationLogRecord } from "@/lib/logging/generation-logs";
import type { GenerationLogEntry, GenerationRun, GenerationStatus } from "./types";

type MessageKind = "prompt" | "summary" | "log";

type TempGenerationRun = {
  id: string;
  generationId?: string | null;
  logs: GenerationLogEntry[];
  request?: ChatMessage;
  summary?: ChatMessage;
  startedAt: string;
  lastUpdatedAt: string;
};

export function buildGenerationRuns(messages: ChatMessage[]): GenerationRun[] {
  const runs: GenerationRun[] = [];
  let current: TempGenerationRun | null = null;
  const seenRunIds = new Set<string>();

  const finalize = () => {
    if (!current) {
      return;
    }
    const runIndex = runs.length + 1;
    const startedAt = current.request?.timestamp ?? current.startedAt;
    const baseId = current.id || `generation-${runIndex}`;
    const uniqueId = ensureUniqueRunId(baseId, seenRunIds);
    seenRunIds.add(uniqueId);
    runs.push({
      id: uniqueId,
      index: runIndex,
      logs: [...current.logs],
      request: current.request,
      summary: current.summary,
      startedAt,
      lastUpdatedAt: current.lastUpdatedAt,
      generationId: current.generationId ?? null,
      hasStableId: Boolean(current.generationId),
    });
    current = null;
  };

  const startRun = (seed: ChatMessage, generationId?: string | null) => {
    const seedTimestamp = resolveMessageTimestamp(seed);
    current = {
      id: generationId ?? seed.id,
      generationId: generationId ?? null,
      logs: [],
      request: undefined,
      summary: undefined,
      startedAt: seedTimestamp,
      lastUpdatedAt: seedTimestamp,
    };
    return current;
  };

  const ensureRun = (seed: ChatMessage, generationId?: string | null): TempGenerationRun => {
    if (!current) {
      return startRun(seed, generationId);
    }
    if (generationId && current.id !== generationId) {
      finalize();
      return startRun(seed, generationId);
    }
    return current;
  };

  messages.forEach((message) => {
    const kind = resolveMessageKind(message);
    const generationId = typeof message.metadata?.generationId === "string" ? message.metadata.generationId : null;
    const resolvedTimestamp = resolveMessageTimestamp(message);

    if (kind === "prompt") {
      const matchesCurrent =
        current &&
        ((generationId && (current.generationId === generationId || current.id === generationId)) ||
          (!generationId && !current.generationId));
      if (matchesCurrent && current) {
        current.request = message;
        current.startedAt = resolvedTimestamp;
        current.lastUpdatedAt = resolvedTimestamp;
        return;
      }
      finalize();
      const run = startRun(message, generationId ?? message.id);
      run.request = message;
      run.startedAt = resolvedTimestamp;
      run.lastUpdatedAt = resolvedTimestamp;
      return;
    }

    const target = ensureRun(message, generationId);
    if (generationId && !target.generationId) {
      target.generationId = generationId;
      target.id = generationId;
    }

    if (kind === "log") {
      const lines = splitLogLines(message.content);
      lines.forEach((line, lineIndex) => {
        target.logs.push({
          id: `${message.id}-${lineIndex}`,
          content: line,
          timestamp: resolvedTimestamp,
          level: message.level ?? "info",
        });
      });
      target.lastUpdatedAt = resolvedTimestamp;
      return;
    }

    target.summary = message;
    target.lastUpdatedAt = resolvedTimestamp;
  });

  finalize();
  return runs;
}

export function buildGenerationRunsFromMetadata(logs: GenerationLogRecord[], chatMessages: ChatMessage[] = []): GenerationRun[] {
  const runs: GenerationRun[] = logs.map((record) => {
    const baseLogs = record.logs.map((log) => ({
      id: log.id,
      content: log.content,
      timestamp: log.timestamp,
      level: log.level,
    }));

    const enrichedLogs = chatMessages
      .filter((message) => message.metadata?.generationId === record.generationId && resolveMessageKind(message) === "log")
      .flatMap((message) => {
        const resolvedTimestamp = resolveMessageTimestamp(message);
        return splitLogLines(message.content).map((line, lineIndex) => ({
          id: `${message.id}-${lineIndex}`,
          content: line,
          timestamp: resolvedTimestamp,
          level: message.level ?? "info",
        }));
      });

    const summaryFromChat = chatMessages.find(
      (message) => message.metadata?.generationId === record.generationId && resolveMessageKind(message) === "summary",
    );

    const summary = record.summary
      ? {
          id: `${record.generationId}-summary`,
          role: "assistant",
          content: record.summary,
          level: "info",
          timestamp: record.lastUpdatedAt,
          metadata: { kind: "summary", generationId: record.generationId },
        }
      : summaryFromChat
        ? summaryFromChat
        : undefined;

    return {
      id: record.generationId,
      index: record.index,
      logs: [...baseLogs, ...enrichedLogs].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)),
      request: undefined,
      summary,
      startedAt: record.startedAt,
      lastUpdatedAt: record.lastUpdatedAt,
      generationId: record.generationId,
      hasStableId: true,
    };
  });

  runs.sort((a, b) => a.index - b.index);
  return runs;
}

export function deriveGenerationStatus(run: GenerationRun, isLatest: boolean, isGenerating: boolean): GenerationStatus {
  const level = run.summary?.level;
  if (level === "error") {
    return "failed";
  }
  if (level === "success") {
    return "completed";
  }
  if (isLatest && isGenerating) {
    return "in-progress";
  }
  if (run.logs.length > 0) {
    return "completed";
  }
  return "pending";
}

export function computeDurationMs(run: GenerationRun, isActive: boolean): number | null {
  const startRaw = run.request?.timestamp ?? run.logs[0]?.timestamp ?? run.summary?.timestamp ?? run.startedAt;
  const start = Date.parse(startRaw);
  if (Number.isNaN(start)) {
    return null;
  }
  if (isActive) {
    return Math.max(0, Date.now() - start);
  }
  const lastLog = run.logs.length ? run.logs[run.logs.length - 1].timestamp : undefined;
  const endRaw = run.summary?.timestamp ?? lastLog ?? run.lastUpdatedAt ?? startRaw;
  const end = Date.parse(endRaw);
  if (Number.isNaN(end) || end <= start) {
    return null;
  }
  return end - start;
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(1, Math.round(milliseconds / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function formatFullTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatLogTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function logLevelClass(level?: "info" | "success" | "warning" | "error"): string {
  switch (level) {
    case "success":
      return "text-emerald-600";
    case "warning":
      return "text-amber-600";
    case "error":
      return "text-red-600";
    default:
      return "text-zinc-500";
  }
}

export function logLevelDotClass(level?: "info" | "success" | "warning" | "error"): string {
  switch (level) {
    case "success":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-zinc-500";
  }
}

function resolveMessageKind(message: ChatMessage): MessageKind {
  if (message.metadata?.kind === "prompt") {
    return "prompt";
  }
  if (message.metadata?.kind === "log") {
    return "log";
  }
  if (message.metadata?.kind === "summary" || message.metadata?.kind === "system") {
    return "summary";
  }
  if (message.role === "user") {
    return "prompt";
  }
  return "summary";
}

function resolveMessageTimestamp(message: ChatMessage): string {
  return message.metadata?.clientTimestamp ?? message.timestamp;
}

function splitLogLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function ensureUniqueRunId(candidate: string, seen: Set<string>): string {
  if (!seen.has(candidate)) {
    return candidate;
  }
  let suffix = 2;
  let next = `${candidate}#${suffix}`;
  while (seen.has(next)) {
    suffix += 1;
    next = `${candidate}#${suffix}`;
  }
  return next;
}
