'use client';

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { useMemo } from "react";
import { GenerationListItem } from "./GenerationListItem";
import type { GenerationLogsPanelProps, GenerationRun } from "./types";

function PanelContents({
  generations,
  isLoading,
  expandedId,
  onUserToggle,
  onClose,
  isGenerating,
  onDeleteGeneration,
  deletingGenerationId,
}: Omit<GenerationLogsPanelProps, "open">) {
  const ordered = useMemo(() => [...generations].sort((a, b) => a.index - b.index), [generations]);
  const newestId = ordered[ordered.length - 1]?.id ?? null;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Diagnostics</p>
          <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Generation Logs</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 transition hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100"
          aria-label="Close diagnostics panel"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>
      <div className="mt-4 flex-1 overflow-y-auto pr-1">
        {isLoading ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading generation activity…</p>
        ) : ordered.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No generations yet. Run a request to inspect logs.</p>
        ) : (
          <ul className="space-y-3">
            {ordered.map((generation: GenerationRun) => {
              const isExpanded = expandedId === generation.id;
              const canDelete = generation.hasStableId;
              const deleting = deletingGenerationId === generation.generationId;
              return (
                <GenerationListItem
                  key={generation.id}
                  generation={generation}
                  isExpanded={isExpanded}
                  onToggle={() => onUserToggle(isExpanded ? null : generation.id)}
                  isLatest={generation.id === newestId}
                  isGenerating={isGenerating}
                  onDelete={() => onDeleteGeneration(generation)}
                  canDelete={canDelete}
                  deleting={deleting}
                />
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function GenerationLogsPanel({ open, ...props }: GenerationLogsPanelProps) {
  if (!open) {
    return null;
  }

  return (
    <>
      <aside className="relative hidden h-full w-[24rem] flex-shrink-0 overflow-hidden rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-6 shadow-sm lg:flex lg:flex-col">
        <PanelContents {...props} />
      </aside>
      <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm lg:hidden" onClick={props.onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-6 shadow-2xl lg:hidden">
        <PanelContents {...props} />
      </div>
    </>
  );
}
