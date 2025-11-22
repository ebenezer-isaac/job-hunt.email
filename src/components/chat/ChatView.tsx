'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useSessionStore, type ChatMessage } from "@/store/session-store";
import type { ArtifactPayload } from "@/hooks/useStreamableValue";

type GenerationStatus = "pending" | "in-progress" | "completed" | "failed";

type GenerationLogEntry = {
  id: string;
  content: string;
  timestamp: string;
  level?: "info" | "success" | "error";
};

type GenerationRun = {
  id: string;
  index: number;
  logs: GenerationLogEntry[];
  request?: ChatMessage;
  summary?: ChatMessage;
  startedAt: string;
  lastUpdatedAt: string;
};

export function ChatView() {
  const chatHistory = useSessionStore((state) => state.chatHistory);
  const generatedDocuments = useSessionStore((state) => state.generatedDocuments);
  const isGenerating = useSessionStore((state) => state.isGenerating);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const containerRef = useRef<HTMLDivElement>(null);
  const generations = useMemo(() => buildGenerationRuns(chatHistory), [chatHistory]);
  const lastWithLogs = useMemo(() => [...generations].reverse().find((run) => run.logs.length > 0) ?? null, [generations]);
  const sessionKey = currentSessionId ?? "__global";
  const [panelStateBySession, setPanelStateBySession] = useState<Record<string, boolean>>({});
  const [expandedBySession, setExpandedBySession] = useState<Record<string, string | null>>({});
  const panelOpen = panelStateBySession[sessionKey] ?? false;
  const expandedGenerationId = expandedBySession[sessionKey] ?? null;
  const userDismissedRef = useRef(false);

  const setPanelOpenForSession = useCallback(
    (value: boolean) => {
      setPanelStateBySession((prev) => {
        const existing = prev[sessionKey];
        if (existing === value) {
          return prev;
        }
        return { ...prev, [sessionKey]: value };
      });
    },
    [sessionKey],
  );

  const setExpandedRaw = useCallback(
    (generationId: string | null) => {
      setExpandedBySession((prev) => ({ ...prev, [sessionKey]: generationId }));
    },
    [sessionKey],
  );

  const setExpandedAuto = useCallback(
    (generationId: string | null) => {
      userDismissedRef.current = false;
      setExpandedRaw(generationId);
    },
    [setExpandedRaw],
  );

  const setExpandedManual = useCallback(
    (generationId: string | null) => {
      userDismissedRef.current = generationId === null;
      setExpandedRaw(generationId);
    },
    [setExpandedRaw],
  );

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    containerRef.current.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [generatedDocuments]);

  useEffect(() => {
    if (expandedGenerationId && !generations.some((run: GenerationRun) => run.id === expandedGenerationId)) {
      setExpandedAuto(null);
    }
  }, [expandedGenerationId, generations, setExpandedAuto]);

  useEffect(() => {
    if (!panelOpen) {
      userDismissedRef.current = false;
      return;
    }
    if (expandedGenerationId || userDismissedRef.current) {
      return;
    }
    const fallback = lastWithLogs ?? generations[generations.length - 1];
    if (fallback) {
      setExpandedAuto(fallback.id);
    }
  }, [panelOpen, expandedGenerationId, generations, lastWithLogs, setExpandedAuto]);

  useEffect(() => {
    if (isGenerating) {
      userDismissedRef.current = false;
    }
  }, [isGenerating]);

  const handleLogsButton = useCallback(() => {
    if (panelOpen) {
      userDismissedRef.current = false;
      setPanelOpenForSession(false);
      return;
    }
    userDismissedRef.current = false;
    setPanelOpenForSession(true);
    const target = lastWithLogs ?? generations[generations.length - 1];
    if (target) {
      setExpandedAuto(target.id);
      return;
    }
    setExpandedAuto(null);
  }, [generations, lastWithLogs, panelOpen, setExpandedAuto, setPanelOpenForSession]);

  const showWelcome = generations.length === 0 && !generatedDocuments;

  return (
    <div className="flex flex-1 flex-col gap-6 lg:flex-row">
      <section className="flex flex-1 flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-6 py-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">Conversation</p>
              <p className="text-base font-semibold text-zinc-900">Artifacts &amp; context</p>
            </div>
            <button
              type="button"
              onClick={handleLogsButton}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-900"
            >
              <span className="text-lg">🧠</span>
              Detailed logs
            </button>
          </div>
          <div ref={containerRef} className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
            {isGenerating ? (
              <div className="flex h-full flex-col items-center justify-center gap-4">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900" />
                <p className="text-sm font-semibold text-zinc-500 animate-pulse">Generating documents...</p>
              </div>
            ) : showWelcome ? (
              <WelcomePanel />
            ) : generatedDocuments ? (
              <ArtifactsPanel />
            ) : null}
          </div>
      </section>
      <GenerationLogsPanel
        open={panelOpen}
        generations={generations}
        expandedId={expandedGenerationId}
        onUserToggle={setExpandedManual}
        onClose={() => {
          userDismissedRef.current = false;
          setPanelOpenForSession(false);
        }}
        isGenerating={isGenerating}
      />
    </div>
  );
}

type GenerationStatusBadgeProps = {
  status: GenerationStatus;
};

function GenerationStatusBadge({ status }: GenerationStatusBadgeProps) {
  const meta: Record<GenerationStatus, { label: string; bg: string; text: string; dot: string }> = {
    pending: { label: "Pending", bg: "bg-zinc-100", text: "text-zinc-700", dot: "bg-zinc-500" },
    "in-progress": { label: "Thinking", bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" },
    completed: { label: "Completed", bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
    failed: { label: "Failed", bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500" },
  };
  const config = meta[status];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${config.bg} ${config.text}`}>
      <span className={`h-2 w-2 rounded-full ${config.dot}`} aria-hidden="true" />
      {config.label}
    </span>
  );
}

type GenerationLogsPanelProps = {
  open: boolean;
  generations: GenerationRun[];
  expandedId: string | null;
  onUserToggle: (id: string | null) => void;
  onClose: () => void;
  isGenerating: boolean;
};

function GenerationLogsPanel({ open, generations, expandedId, onUserToggle, onClose, isGenerating }: GenerationLogsPanelProps) {
  if (!open) {
    return null;
  }

  return (
    <>
      <aside className="relative hidden h-full w-[24rem] flex-shrink-0 overflow-hidden rounded-3xl border border-zinc-200 bg-white px-5 py-6 shadow-sm lg:flex lg:flex-col">
        <PanelContents
          generations={generations}
          expandedId={expandedId}
          onUserToggle={onUserToggle}
          onClose={onClose}
          isGenerating={isGenerating}
        />
      </aside>
      <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm md:hidden" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-40 flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white px-5 py-6 shadow-2xl md:hidden">
        <PanelContents
          generations={generations}
          expandedId={expandedId}
          onUserToggle={onUserToggle}
          onClose={onClose}
          isGenerating={isGenerating}
        />
      </div>
    </>
  );
}

type PanelContentsProps = {
  generations: GenerationRun[];
  expandedId: string | null;
  onUserToggle: (id: string | null) => void;
  onClose: () => void;
  isGenerating: boolean;
};

function PanelContents({ generations, expandedId, onUserToggle, onClose, isGenerating }: PanelContentsProps) {
  const ordered = useMemo(() => [...generations].sort((a, b) => a.index - b.index), [generations]);
  const newestId = ordered[ordered.length - 1]?.id ?? null;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Diagnostics</p>
          <p className="text-base font-semibold text-zinc-900">Generation Logs</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-lg text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-900"
          aria-label="Close diagnostics panel"
        >
          ×
        </button>
      </div>
      <div className="mt-4 flex-1 overflow-y-auto pr-1">
        {ordered.length === 0 ? (
          <p className="text-sm text-zinc-500">No generations yet. Run a request to inspect logs.</p>
        ) : (
          <ul className="space-y-3">
            {ordered.map((generation: GenerationRun) => {
              const isExpanded = expandedId === generation.id;
              return (
                <GenerationListItem
                  key={generation.id}
                  generation={generation}
                  isExpanded={isExpanded}
                  onToggle={() => onUserToggle(isExpanded ? null : generation.id)}
                  isLatest={generation.id === newestId}
                  isGenerating={isGenerating}
                />
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

type GenerationListItemProps = {
  generation: GenerationRun;
  isExpanded: boolean;
  onToggle: () => void;
  isLatest: boolean;
  isGenerating: boolean;
};

function GenerationListItem({ generation, isExpanded, onToggle, isLatest, isGenerating }: GenerationListItemProps) {
  const status = deriveGenerationStatus(generation, isLatest, isGenerating);
  const durationMs = computeDurationMs(generation, status === "in-progress");
  const durationLabel = durationMs ? formatDuration(durationMs) : null;
  const summaryContent = generation.summary?.content ?? null;
  const requestPreview = generation.request?.content ?? "No request captured for this generation.";

  return (
    <li className="rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Generation {generation.index}</p>
          <p className="text-xs text-zinc-500">{formatFullTimestamp(generation.startedAt)}</p>
        </div>
        <GenerationStatusBadge status={status} />
      </div>
      {summaryContent ? (
        <div className="prose prose-sm mt-3 text-sm text-zinc-800">
          <ReactMarkdown>{summaryContent}</ReactMarkdown>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="mt-3 flex w-full items-center justify-between rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-900"
      >
        <span className="inline-flex items-center gap-2">
          Detailed logs
          <svg
            className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : "rotate-0"}`}
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path d="M5 7l5 6 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="text-xs font-normal text-zinc-500">
          {status === "in-progress"
            ? "Thinking…"
            : durationLabel
              ? `Thought for ${durationLabel}`
              : "Duration unavailable"}
        </span>
      </button>
      {isExpanded ? (
        <div className="mt-3 rounded-2xl border border-zinc-100 bg-white px-3 py-3">
          {generation.logs.length === 0 ? (
            <p className="text-xs text-zinc-500">No detailed logs captured for this run.</p>
          ) : (
            <ul className="space-y-2 text-sm text-zinc-800">
              {generation.logs.map((log: GenerationLogEntry) => (
                <li key={log.id} className="flex gap-3" title={formatLogTimestamp(log.timestamp)}>
                  <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${logLevelDotClass(log.level)}`} aria-hidden="true" />
                  <div className="flex flex-col">
                    <span className={`text-[11px] font-semibold uppercase tracking-wide ${logLevelClass(log.level)}`}>
                      {(log.level ?? "info").toUpperCase()}
                    </span>
                    <p className="leading-snug text-zinc-800">{log.content}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}

type MessageKind = "prompt" | "summary" | "log";

type TempGenerationRun = {
  id: string;
  logs: GenerationLogEntry[];
  request?: ChatMessage;
  summary?: ChatMessage;
  startedAt: string;
  lastUpdatedAt: string;
};

// Groups raw chat entries into per-generation runs so the panel can render an ordered log history.
function buildGenerationRuns(messages: ChatMessage[]): GenerationRun[] {
  const runs: GenerationRun[] = [];
  let current: TempGenerationRun | null = null;

  const finalize = () => {
    if (!current) {
      return;
    }
    const runIndex = runs.length + 1;
    const startedAt = current.request?.timestamp ?? current.startedAt;
    runs.push({
      id: current.id || `generation-${runIndex}`,
      index: runIndex,
      logs: [...current.logs],
      request: current.request,
      summary: current.summary,
      startedAt,
      lastUpdatedAt: current.lastUpdatedAt,
    });
    current = null;
  };

    const ensureRun = (seed: ChatMessage): TempGenerationRun => {
      if (current) {
        return current;
      }
      current = {
        id: seed.id,
        logs: [],
        request: undefined,
        summary: undefined,
        startedAt: seed.timestamp,
        lastUpdatedAt: seed.timestamp,
      };
      return current;
    };

  messages.forEach((message) => {
    const kind = resolveMessageKind(message);
    if (kind === "prompt") {
      finalize();
      current = {
        id: message.id,
        logs: [],
        request: message,
        summary: undefined,
        startedAt: message.timestamp,
        lastUpdatedAt: message.timestamp,
      };
      return;
    }

    const target = ensureRun(message);

    if (kind === "log") {
      const lines = splitLogLines(message.content);
      lines.forEach((line, lineIndex) => {
        target.logs.push({
          id: `${message.id}-${lineIndex}`,
          content: line,
          timestamp: message.timestamp,
          level: message.level ?? "info",
        });
      });
      target.lastUpdatedAt = message.timestamp;
      return;
    }

    target.summary = message;
    target.lastUpdatedAt = message.timestamp;
  });

  finalize();
  return runs;
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

function splitLogLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function deriveGenerationStatus(run: GenerationRun, isLatest: boolean, isGenerating: boolean): GenerationStatus {
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

function computeDurationMs(run: GenerationRun, isActive: boolean): number | null {
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

function formatDuration(milliseconds: number): string {
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

function formatFullTimestamp(value: string): string {
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

function formatLogTimestamp(value: string): string {
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

function logLevelClass(level?: "info" | "success" | "error"): string {
  switch (level) {
    case "success":
      return "text-emerald-600";
    case "error":
      return "text-red-600";
    default:
      return "text-zinc-500";
  }
}

function logLevelDotClass(level?: "info" | "success" | "error"): string {
  switch (level) {
    case "success":
      return "bg-emerald-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-zinc-500";
  }
}

function WelcomePanel() {
  return (
    <div className="mb-8 rounded-3xl border border-dashed border-zinc-200 bg-gradient-to-b from-white to-zinc-50 px-6 py-10 text-center">
      <p className="text-sm uppercase tracking-wide text-zinc-500">job-hunt.email</p>
      <h2 className="mt-3 text-3xl font-semibold text-zinc-900">AI Job Application Assisstant</h2>
      <p className="mt-2 text-base text-zinc-500">Paste a URL, drop in a job description and get a customized cv with the click of a button</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {["Paste a URL", "Paste Job Description", "Refine Content"].map((title, index) => (
          <div key={title} className="rounded-2xl border border-zinc-100 bg-white px-4 py-6 text-left shadow-sm">
            <div className="text-2xl">{["🔗", "📝", "💬"][index]}</div>
            <p className="mt-3 text-base font-semibold text-zinc-900">{title}</p>
            <p className="mt-1 text-sm text-zinc-500">
              {index === 0
                ? "Drop a job posting link to auto-extract details."
                : index === 1
                  ? "Paste the entire description and let AI analyse it."
                  : "Chat back with refinements to perfect each document."}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArtifactsPanel() {
  const generatedDocuments = useSessionStore((state) => state.generatedDocuments);
  const entries = useMemo(() => {
    if (!generatedDocuments) {
      return [];
    }
    return [
      { label: "CV", value: generatedDocuments.cv, icon: "📄" },
      { label: "Cover Letter", value: generatedDocuments.coverLetter, icon: "✉️" },
      { label: "Cold Email", value: generatedDocuments.coldEmail, icon: "📬" },
    ].filter((entry) => Boolean(entry.value));
  }, [generatedDocuments]);

  if (!generatedDocuments || entries.length === 0) {
    return null;
  }

  return (
    <section className="mt-6 space-y-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Generated Artifacts</p>
      {entries.map((entry) => (
        <ArtifactCard key={entry.label} label={entry.label} icon={entry.icon} payload={entry.value} />
      ))}
    </section>
  );
}

type ArtifactCardProps = {
  label: string;
  icon: string;
  payload?: ArtifactPayload;
};

function ArtifactCard({ label, icon, payload }: ArtifactCardProps) {
  if (!payload) {
    return null;
  }

  if (label === "Cold Email") {
    return <ColdEmailCard icon={icon} payload={payload} />;
  }

  const isPdf = payload.mimeType === "application/pdf";
  const canCopy = Boolean(payload.content && payload.content.trim().length);
  const downloadName = payload.mimeType === "application/msword" ? "cover-letter.doc" : undefined;
  const previewUrl = buildSecureDownloadUrl(payload, { disposition: "inline" });
  const downloadUrl = buildSecureDownloadUrl(payload, { disposition: "attachment" }) ?? previewUrl;
  const metadataLines = [
    payload.mimeType ? `Type: ${payload.mimeType}` : null,
    payload.pageCount ? `Pages: ${payload.pageCount}` : null,
    payload.emailAddresses?.length ? `Emails: ${payload.emailAddresses.join(", ")}` : null,
  ].filter(Boolean);
  const changeSummary = payload.changeSummary?.trim() ?? "";

  const handleCopy = () => {
    if (payload.content && typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(payload.content);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-base font-semibold text-zinc-900">
          <span>{icon}</span>
          {label}
        </div>
        <div className="flex gap-2">
          {downloadUrl ? (
            <a
              href={downloadUrl}
              className="text-xs font-semibold text-emerald-600 transition hover:text-emerald-800"
              download={downloadName}
            >
              Download
            </a>
          ) : null}
          {canCopy ? (
            <button
              type="button"
              className="text-xs font-semibold text-zinc-500 transition hover:text-zinc-900"
              onClick={handleCopy}
            >
              Copy
            </button>
          ) : null}
        </div>
      </div>
      {metadataLines.length ? (
        <p className="mt-1 text-xs text-zinc-500">{metadataLines.join(" · ")}</p>
      ) : null}
      {label === "CV" && changeSummary ? (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Changes Made</p>
          <div className="prose prose-sm mt-2 text-sm text-emerald-800">
            <ReactMarkdown>{changeSummary}</ReactMarkdown>
          </div>
        </div>
      ) : null}
      {isPdf && previewUrl ? (
        <div className="mt-3 space-y-3">
          <iframe
            src={`${previewUrl}#toolbar=0&view=FitH`}
            title={`${label} preview`}
            className="min-h-[26rem] w-full rounded-xl border border-zinc-200"
          />
          <p className="text-xs text-zinc-500">
            Rendering PDF preview. Use Download for the full-resolution copy.
          </p>
        </div>
      ) : (
        <pre className="mt-3 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl bg-zinc-50 p-4 text-xs text-zinc-700">
          {payload.content}
        </pre>
      )}
    </div>
  );
}

type ColdEmailCardProps = {
  icon: string;
  payload: ArtifactPayload;
};

function ColdEmailCard({ icon, payload }: ColdEmailCardProps) {
  const toAddress = payload.toAddress || payload.emailAddresses?.[0] || "hello@example.com";
  const subject = payload.subject || "Warm introduction";
  const body = payload.body || payload.content;
  const mailto = buildMailtoLink(toAddress, subject, body);
  const downloadUrl = buildSecureDownloadUrl(payload, { disposition: "attachment" });

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-base font-semibold text-zinc-900">
          <span>{icon}</span>
          Cold Email
        </div>
        <div className="flex gap-2">
          <a
            href={mailto}
            className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
          >
            Compose Email
          </a>
          {downloadUrl ? (
            <a
              href={downloadUrl}
              className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-900"
              download="cold-email.txt"
            >
              Raw TXT
            </a>
          ) : null}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <CopyField label="To" value={toAddress} />
        <CopyField label="Subject" value={subject} />
        <CopyField label="Body" value={body} multiline />
      </div>
    </div>
  );
}

type CopyFieldProps = {
  label: string;
  value: string;
  multiline?: boolean;
};

function CopyField({ label, value, multiline }: CopyFieldProps) {
  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(value);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-3">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <span>{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-[11px] font-semibold text-zinc-500 transition hover:text-zinc-900"
        >
          Copy
        </button>
      </div>
      {multiline ? (
        <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm text-zinc-800">{value}</pre>
      ) : (
        <p className="mt-2 truncate text-sm text-zinc-800">{value}</p>
      )}
    </div>
  );
}

function buildMailtoLink(to: string, subject: string, body: string): string {
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body.replace(/\n/g, "\r\n"));
  const sanitizedTo = to || "hello@example.com";
  return `mailto:${encodeURIComponent(sanitizedTo)}?subject=${encodedSubject}&body=${encodedBody}`;
}

type DownloadUrlOptions = {
  disposition?: "inline" | "attachment";
};

function buildSecureDownloadUrl(payload: ArtifactPayload, options?: DownloadUrlOptions): string | null {
  const baseUrl = payload.storageKey
    ? `/api/download?key=${encodeURIComponent(payload.storageKey)}`
    : payload.downloadUrl ?? null;

  if (!baseUrl) {
    return null;
  }

  if (!payload.storageKey || !options?.disposition) {
    return baseUrl;
  }

  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}disposition=${options.disposition}`;
}
