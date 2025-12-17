import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import ReactMarkdown from "react-markdown";
import { GenerationStatusBadge } from ".";
import type { GenerationRun } from "./types";
import {
  computeDurationMs,
  deriveGenerationStatus,
  formatDuration,
  formatFullTimestamp,
  formatLogTimestamp,
  logLevelClass,
  logLevelDotClass,
} from "./utils";

type GenerationListItemProps = {
  generation: GenerationRun;
  isExpanded: boolean;
  onToggle: () => void;
  isLatest: boolean;
  isGenerating: boolean;
  onDelete: () => void;
  canDelete: boolean;
  deleting: boolean;
};

export function GenerationListItem({
  generation,
  isExpanded,
  onToggle,
  isLatest,
  isGenerating,
  onDelete,
  canDelete,
  deleting,
}: GenerationListItemProps) {
  const status = deriveGenerationStatus(generation, isLatest, isGenerating);
  const durationMs = computeDurationMs(generation, status === "in-progress");
  const durationLabel = durationMs ? formatDuration(durationMs) : null;
  const summaryContent = generation.summary?.content ?? null;

  return (
    <li className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Generation {generation.index}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatFullTimestamp(generation.startedAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <GenerationStatusBadge status={status} />
          <button
            type="button"
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition ${
              canDelete
                ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/30"
                : "border-zinc-200 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600"
            }`}
            aria-label={canDelete ? "Delete generation" : "Deletion unavailable for this generation"}
            onClick={(event) => {
              event.stopPropagation();
              if (canDelete && !deleting) {
                onDelete();
              }
            }}
            disabled={!canDelete || deleting}
          >
            {deleting ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <FontAwesomeIcon icon={faTrash} />
            )}
          </button>
        </div>
      </div>
      {summaryContent ? (
        <div className="prose prose-sm mt-3 text-sm text-zinc-800 dark:text-zinc-200">
          <ReactMarkdown>{summaryContent}</ReactMarkdown>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="mt-3 flex w-full items-center justify-between rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 transition hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100"
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
        <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
          {status === "in-progress"
            ? "Thinking…"
            : durationLabel
              ? `Thought for ${durationLabel}`
              : "Duration unavailable"}
        </span>
      </button>
      {isExpanded ? (
        <div className="mt-3 rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-3">
          {generation.logs.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">No detailed logs captured for this run.</p>
          ) : (
            <ul className="space-y-2 text-sm text-zinc-800 dark:text-zinc-200">
              {generation.logs.map((log) => (
                <li key={log.id} className="flex gap-3" title={formatLogTimestamp(log.timestamp)}>
                  <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${logLevelDotClass(log.level)}`} aria-hidden="true" />
                  <div className="flex flex-col">
                    <span className={`text-[11px] font-semibold uppercase tracking-wide ${logLevelClass(log.level)}`}>
                      {(log.level ?? "info").toUpperCase()}
                    </span>
                    <p className="leading-snug text-zinc-800 dark:text-zinc-200">{log.content}</p>
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
