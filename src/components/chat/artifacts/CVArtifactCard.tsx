'use client';

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import { toast } from "sonner";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { useSessionStore } from "@/store/session-store";
import type { ArtifactPayload } from "@/hooks/useStreamableValue";
import { recompileCvAction } from "@/app/actions/recompile-cv";
import { saveContentAction } from "@/app/actions/save-content";
import { useDebouncedCallback } from "use-debounce";

export type CVArtifactCardProps = {
  label: string;
  icon: IconDefinition;
  payload: ArtifactPayload;
  isSessionGenerating: boolean;
};

export function CVArtifactCard({ label, icon, payload, isSessionGenerating }: CVArtifactCardProps) {
  const versions = payload.versions ?? [];
  const sessionId = useSessionStore((state) => state.currentSessionId);
  const { upsertSession, updateSourceDocument } = useSessionStore((state) => state.actions);
  const [versionIndex, setVersionIndex] = useState<number>(versions.length ? versions.length - 1 : 0);
  const activeVersion = versions[versionIndex] ?? null;
  const effectiveContent = activeVersion?.content ?? payload.content ?? "";
  const effectiveGenerationId = activeVersion?.generationId ?? payload.generationId;
  const canCopy = Boolean(effectiveContent.trim().length);
  const hasRenderableLatex = label === "CV" && Boolean(effectiveGenerationId || effectiveContent.trim() || versions.length);
  const renderBase = label === "CV" && sessionId && hasRenderableLatex
    ? `/api/render-pdf?sessionId=${encodeURIComponent(sessionId)}&artifact=cv${effectiveGenerationId ? `&generationId=${encodeURIComponent(effectiveGenerationId)}` : ""}`
    : null;
  const previewUrl = renderBase ? `${renderBase}&disposition=inline` : null;
  const downloadUrl = renderBase ? `${renderBase}&disposition=attachment` : null;
  const [previewVersion, setPreviewVersion] = useState<number>(0);
  const previewUrlWithBust = previewUrl ? `${previewUrl}${previewUrl.includes("?") ? "&" : "?"}v=${previewVersion}` : null;
  const [previewLoading, setPreviewLoading] = useState<boolean>(Boolean(previewUrl));
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [latexDraft, setLatexDraft] = useState<string>(effectiveContent);
  const [isCompiling, setIsCompiling] = useState(false);
  const [latexSaveState, setLatexSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const debouncedSaveLatex = useDebouncedCallback((value: string) => {
    setLatexSaveState("saving");
    saveContentAction({ docType: "original_cv", content: value })
      .then(() => {
        updateSourceDocument("originalCV", value);
        setLatexSaveState("saved");
      })
      .catch((error) => {
        setLatexSaveState("error");
        toast.error(error instanceof Error ? error.message : "Unable to save LaTeX source");
      });
  }, 800);

  useEffect(() => {
    const nextLength = versions.length;
    setVersionIndex(nextLength ? nextLength - 1 : 0);
  }, [versions.length, payload.storageKey]);

  useEffect(() => {
    setLatexDraft(effectiveContent);
    setLatexSaveState("idle");
    setPreviewVersion((value) => value + 1);
    setPreviewLoading(Boolean(previewUrl));
    setPreviewError(null);
  }, [effectiveContent, previewUrl]);

  const handleCopy = () => {
    if (effectiveContent && typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(effectiveContent);
    }
  };

  const handleCompile = async () => {
    if (!sessionId) {
      toast.error("Select a session first.");
      return;
    }
    if (!latexDraft.trim()) {
      toast.error("Add LaTeX before compiling.");
      return;
    }
    if (isCompiling) {
      return;
    }
    setIsCompiling(true);
    try {
      const result = await recompileCvAction({ sessionId, latex: latexDraft, generationId: effectiveGenerationId });
      upsertSession(result.session);
      setPreviewVersion(Date.now());
      setPreviewLoading(true);
      toast.success("CV recompiled.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Compile failed: ${message}`);
    } finally {
      setIsCompiling(false);
    }
  };

  const handlePrevVersion = () => {
    if (!versions.length) return;
    setVersionIndex((index) => (index - 1 + versions.length) % versions.length);
  };

  const handleNextVersion = () => {
    if (!versions.length) return;
    setVersionIndex((index) => (index + 1) % versions.length);
  };

  const showSpinner = previewUrl && !previewError && (previewLoading || (isSessionGenerating && versions.length === 0));

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          <FontAwesomeIcon icon={icon} />
          {label}
        </div>
        {versions.length > 0 ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            <button
              type="button"
              onClick={handlePrevVersion}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:border-zinc-400 dark:hover:border-zinc-600"
              title="Previous version"
            >
              ◀
            </button>
            <span>{`${Math.min(versionIndex + 1, versions.length)}/${versions.length || 1}`}</span>
            <button
              type="button"
              onClick={handleNextVersion}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:border-zinc-400 dark:hover:border-zinc-600"
              title="Next version"
            >
              ▶
            </button>
            {isSessionGenerating && versionIndex === versions.length - 1 ? (
              <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border border-emerald-500 border-t-transparent" />
                Generating
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="flex gap-2">
          {downloadUrl ? (
            <a
              href={downloadUrl}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 transition hover:text-emerald-800 dark:hover:text-emerald-300 flex items-center gap-1"
            >
              <FontAwesomeIcon icon={faDownload} />
              <span className="hidden sm:inline">Download</span>
            </a>
          ) : null}
          {canCopy ? (
            <button
              type="button"
              className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 transition hover:text-zinc-900 dark:hover:text-zinc-100"
              onClick={handleCopy}
              title="Copy"
            >
              <FontAwesomeIcon icon={faCopy} className="text-sm" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{payload.mimeType ? `Type: ${payload.mimeType}` : ""}</div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 md:items-start md:gap-6">
        <div className="flex h-full flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">LaTeX Source</p>
            <button
              type="button"
              onClick={handleCompile}
              disabled={isCompiling}
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-400"
            >
              {isCompiling ? "Compiling..." : "Compile"}
            </button>
          </div>
          <textarea
            value={latexDraft}
            onChange={(event) => {
              const next = event.target.value;
              setLatexDraft(next);
              setLatexSaveState("saving");
              debouncedSaveLatex(next);
            }}
            onBlur={() => debouncedSaveLatex.flush?.()}
            className="h-[26rem] w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs font-normal text-zinc-800 shadow-inner focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 resize-none"
            spellCheck={false}
          />
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Auto-saves to your workspace; compile to refresh the PDF preview. Status: {latexSaveState === "saving" && "Saving..."}
            {latexSaveState === "saved" && "Saved"}
            {latexSaveState === "error" && "Save failed"}
            {latexSaveState === "idle" && "Idle"}
          </p>
        </div>
        <div className="flex h-full flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">PDF Preview</p>
            <span className="inline-block h-8 w-16" aria-hidden="true" />
          </div>
          <div className="relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800">
            <div className="h-[26rem] w-full overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
              {previewUrl ? (
                <iframe
                  src={`${previewUrlWithBust ?? previewUrl}#toolbar=0&view=FitH`}
                  title={`${label} preview`}
                  className="h-full w-full"
                  onLoad={() => setPreviewLoading(false)}
                    onError={() => {
                      setPreviewLoading(false);
                      setPreviewError("Preview failed to render. Recompile to retry.");
                    }}
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-600 dark:text-zinc-300">
                  Add LaTeX and compile to generate a preview.
                </div>
              )}
            </div>
              {previewError ? (
                <div className="absolute inset-x-0 bottom-0 bg-red-50 px-4 py-2 text-center text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-200">
                  {previewError}
                </div>
              ) : null}
            {showSpinner ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gradient-to-b from-white/60 to-white/30 dark:from-zinc-900/60 dark:to-zinc-900/30">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              </div>
            ) : null}
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Recompile after edits to refresh the preview.</p>
        </div>
      </div>
    </div>
  );
}
