"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faList } from "@fortawesome/free-solid-svg-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { deleteGenerationAction } from "@/app/actions/delete-generation";
import type { GenerationArtifacts } from "@/hooks/useStreamableValue";
import type { GenerationLogRecord } from "@/lib/logging/generation-logs";
import { useSessionStore } from "@/store/session-store";
import { ArtifactsPanel } from "./artifacts/ArtifactsPanel";
import { GenerationLogsPanel, buildGenerationRuns, buildGenerationRunsFromMetadata, type GenerationRun } from "./generation";
import { WelcomePanel } from "./WelcomePanel";

export function ChatView() {
  const chatHistory = useSessionStore((state) => state.chatHistory);
  const generatedDocuments: GenerationArtifacts | null = useSessionStore((state) => state.generatedDocuments);
  const isGenerating = useSessionStore((state) => state.isGenerating);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const sessions = useSessionStore((state) => state.sessions);
  const { upsertSession } = useSessionStore((state) => state.actions);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentSession = useMemo(
    () => sessions.find((session) => session.id === currentSessionId) ?? null,
    [sessions, currentSessionId],
  );
  const metadataLogs = useMemo(() => {
    const raw = currentSession?.metadata?.generationLogs;
    if (Array.isArray(raw)) {
      return raw as GenerationLogRecord[];
    }
    return [];
  }, [currentSession]);
  const generations = useMemo(() => {
    if (metadataLogs.length > 0) {
      return buildGenerationRunsFromMetadata(metadataLogs, chatHistory);
    }
    return buildGenerationRuns(chatHistory);
  }, [chatHistory, metadataLogs]);
  const lastWithLogs = useMemo(() => [...generations].reverse().find((run) => run.logs.length > 0) ?? null, [generations]);
  const sessionKey = currentSessionId ?? "__global";
  const [panelStateBySession, setPanelStateBySession] = useState<Record<string, boolean>>({});
  const [expandedBySession, setExpandedBySession] = useState<Record<string, string | null>>({});
  const panelOpen = panelStateBySession[sessionKey] ?? false;
  const expandedGenerationId = expandedBySession[sessionKey] ?? null;
  const userDismissedRef = useRef(false);
  const [deletingGenerationId, setDeletingGenerationId] = useState<string | null>(null);

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
      return;
    }
    setExpandedAuto(null);
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

  const handleDeleteGeneration = useCallback(
    async (generation: GenerationRun) => {
      if (!currentSessionId) {
        toast.error("Select a session before deleting a generation.");
        return;
      }
      if (!generation.hasStableId || !generation.generationId) {
        toast.error("Deletion is only available for recent generations.");
        return;
      }
      if (deletingGenerationId) {
        return;
      }
      setDeletingGenerationId(generation.generationId);
      try {
        const messageIds = [generation.request?.id, generation.summary?.id].filter((value): value is string => Boolean(value));
        const updatedSession = await deleteGenerationAction({
          sessionId: currentSessionId,
          generationId: generation.generationId,
          messageIds,
        });
        const sanitizedSession = {
          ...updatedSession,
          chatHistory: updatedSession.chatHistory.filter((message) => {
            const metaId = message.metadata?.generationId;
            return !metaId || metaId !== generation.generationId;
          }),
        };
        upsertSession(sanitizedSession);
        toast.success("Generation deleted");
        if (expandedGenerationId === generation.id) {
          setExpandedManual(null);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Failed to delete generation: ${message}`);
      } finally {
        setDeletingGenerationId((prev) => (prev === generation.generationId ? null : prev));
      }
    },
    [currentSessionId, deletingGenerationId, expandedGenerationId, setExpandedManual, upsertSession],
  );

  const showWelcome = generations.length === 0 && !generatedDocuments;

  return (
    <div className="flex flex-1 flex-col gap-6 lg:flex-row">
      <section className="flex flex-1 flex-col overflow-hidden rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Conversation</p>
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Artifacts &amp; context</p>
          </div>
          <button
            type="button"
            onClick={handleLogsButton}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 transition hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <FontAwesomeIcon icon={faList} className="text-lg" />
            Logs
          </button>
        </div>
        <div ref={containerRef} className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {showWelcome ? (
            <WelcomePanel />
          ) : generatedDocuments ? (
            <div className="relative">
              {isGenerating ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70 dark:bg-zinc-900/70 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-100" />
                    <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">Generating next version...</p>
                  </div>
                </div>
              ) : null}
              <ArtifactsPanel artifacts={generatedDocuments} />
            </div>
          ) : isGenerating ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-100" />
              <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 animate-pulse">Generating documents...</p>
            </div>
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
        onDeleteGeneration={handleDeleteGeneration}
        deletingGenerationId={deletingGenerationId}
      />
    </div>
  );
}
