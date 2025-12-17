"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faList } from "@fortawesome/free-solid-svg-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { deleteGenerationAction } from "@/app/actions/delete-generation";
import type { GenerationArtifacts } from "@/hooks/useStreamableValue";
import { useSessionStore } from "@/store/session-store";
import { ArtifactsPanel } from "./artifacts/ArtifactsPanel";
import { useGenerationLogs } from "@/hooks/useGenerationLogs";
import { GenerationLogsPanel, type GenerationRun } from "./generation";
import { WelcomePanel } from "./WelcomePanel";

export function ChatView() {
  const generatedDocuments: GenerationArtifacts | null = useSessionStore((state) => state.generatedDocuments);
  const isGenerating = useSessionStore((state) => state.isGenerating);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const { upsertSession } = useSessionStore((state) => state.actions);
  const { runs: generations, isLoading: generationLogsLoading } = useGenerationLogs(currentSessionId);
  const safeGenerations = Array.isArray(generations) ? generations : [];
  const containerRef = useRef<HTMLDivElement>(null);
  const lastWithLogs = useMemo(
    () => [...safeGenerations].reverse().find((run) => run.logs.length > 0) ?? null,
    [safeGenerations],
  );
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
    if (expandedGenerationId && !safeGenerations.some((run: GenerationRun) => run.id === expandedGenerationId)) {
      setExpandedAuto(null);
    }
  }, [expandedGenerationId, safeGenerations, setExpandedAuto]);

  useEffect(() => {
    if (!panelOpen) {
      userDismissedRef.current = false;
      return;
    }
    if (expandedGenerationId || userDismissedRef.current) {
      return;
    }
    const fallback = lastWithLogs ?? safeGenerations[safeGenerations.length - 1];
    if (fallback) {
      setExpandedAuto(fallback.id);
      return;
    }
    setExpandedAuto(null);
  }, [panelOpen, expandedGenerationId, safeGenerations, lastWithLogs, setExpandedAuto]);

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
    const target = lastWithLogs ?? safeGenerations[safeGenerations.length - 1];
    if (target) {
      setExpandedAuto(target.id);
      return;
    }
    setExpandedAuto(null);
  }, [safeGenerations, lastWithLogs, panelOpen, setExpandedAuto, setPanelOpenForSession]);

  const handleDeleteGeneration = useCallback(
    async (generation: GenerationRun) => {
      if (!currentSessionId) {
        toast.error("Select a session before deleting a generation.");
        return;
      }
      if (!generation.hasStableId) {
        toast.error("Deletion is only available for recent generations.");
        return;
      }
      if (deletingGenerationId) {
        return;
      }
      setDeletingGenerationId(generation.generationId);
      try {
        const updatedSession = await deleteGenerationAction({
          sessionId: currentSessionId,
          generationId: generation.generationId,
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

  const showWelcome = safeGenerations.length === 0 && !generatedDocuments;

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
            <ArtifactsPanel artifacts={generatedDocuments} />
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
        generations={safeGenerations}
        isLoading={generationLogsLoading}
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
