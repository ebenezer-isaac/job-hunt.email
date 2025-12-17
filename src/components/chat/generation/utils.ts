import type { GenerationRun, GenerationStatus } from "./types";

export function deriveGenerationStatus(run: GenerationRun, isLatest: boolean, isGenerating: boolean): GenerationStatus {
  if (run.status) {
    return run.status;
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
  const startRaw = run.logs[0]?.timestamp ?? run.summary?.timestamp ?? run.startedAt;
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

