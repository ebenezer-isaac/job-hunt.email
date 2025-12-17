'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import { toast } from "sonner";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { useSessionStore } from "@/store/session-store";
import type { ArtifactPayload } from "@/hooks/useStreamableValue";
import { recompileCvAction } from "@/app/actions/recompile-cv";
import { autoFixCvAction } from "@/app/actions/auto-fix-cv";
import { saveContentAction } from "@/app/actions/save-content";
import { useAutosave } from "@/hooks/useAutosave";
import promptCatalog from "@/prompts.json";

export type CVArtifactCardProps = {
  label: string;
  icon: IconDefinition;
  payload: ArtifactPayload;
  isSessionGenerating: boolean;
};

type RenderIssue = {
  title: string;
  detail?: string;
  log?: string;
  lineNumbers?: number[];
  errors?: Array<{ message: string; lineNumbers?: number[] }>;
};

export function CVArtifactCard({ label, icon, payload, isSessionGenerating }: CVArtifactCardProps) {
  const versions = useMemo(() => payload.versions ?? [], [payload.versions]);
  const normalizedVersions = useMemo(() => {
    const sorted = [...versions].sort((a, b) => {
      const aTime = a.createdAt ?? "";
      const bTime = b.createdAt ?? "";
      if (aTime && bTime) return aTime.localeCompare(bTime);
      if (aTime) return 1;
      if (bTime) return -1;
      return (a.generationId ?? "").localeCompare(b.generationId ?? "");
    });
    const deduped = new Map<string, (typeof versions)[number]>();
    sorted.forEach((entry, idx) => {
      const key = entry.generationId || entry.createdAt || `idx-${idx}`;
      if (deduped.has(key)) {
        deduped.delete(key);
      }
      deduped.set(key, entry);
    });
    return Array.from(deduped.values());
  }, [versions]);
  const hasProcessingVersion = normalizedVersions.some((version) => version.status === "processing");
  const [pendingLatched, setPendingLatched] = useState<boolean>(isSessionGenerating || hasProcessingVersion);
  useEffect(() => {
    if (isSessionGenerating || hasProcessingVersion) {
      setPendingLatched(true);
    } else {
      setPendingLatched(false);
    }
  }, [isSessionGenerating, hasProcessingVersion]);
  const hasPendingVersion = pendingLatched;
  const virtualVersions = useMemo(
    () =>
      hasPendingVersion
        ? [...normalizedVersions, { generationId: "__pending__", content: "", status: "processing" }]
        : normalizedVersions,
    [hasPendingVersion, normalizedVersions],
  );
  const sessionId = useSessionStore((state) => state.currentSessionId);
  const { upsertSession, updateSourceDocument } = useSessionStore((state) => state.actions);
  const [versionIndex, setVersionIndex] = useState<number>(virtualVersions.length ? virtualVersions.length - 1 : 0);
  const selectedVersionIdRef = useRef<string | null>(virtualVersions[versionIndex]?.generationId ?? null);
  const activeVersion = virtualVersions[versionIndex] ?? null;
  const isPendingVersion = activeVersion?.generationId === "__pending__";
  const isFailedVersion = activeVersion?.status === "failed";
  const effectiveContent = activeVersion?.content ?? payload.content ?? "";
  const effectiveGenerationId = activeVersion?.generationId ?? payload.generationId;
  const canCopy = Boolean(effectiveContent.trim().length) && !isPendingVersion;
  const hasRenderableLatex = label === "CV" && !isPendingVersion && Boolean(effectiveGenerationId || effectiveContent.trim() || versions.length);
  const renderBase = label === "CV" && sessionId && hasRenderableLatex
    ? `/api/render-pdf?sessionId=${encodeURIComponent(sessionId)}&artifact=cv${effectiveGenerationId ? `&generationId=${encodeURIComponent(effectiveGenerationId)}` : ""}`
    : null;
  const previewUrl = renderBase ? `${renderBase}&disposition=inline` : null;
  const downloadUrl = renderBase ? `${renderBase}&disposition=attachment` : null;
  const [previewVersion, setPreviewVersion] = useState<number>(0);
  const previewUrlWithBust = previewUrl ? `${previewUrl}${previewUrl.includes("?") ? "&" : "?"}v=${previewVersion}` : null;
  const [previewLoading, setPreviewLoading] = useState<boolean>(Boolean(previewUrl));
  const [latexDraft, setLatexDraft] = useState<string>(effectiveContent);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const {
    saveState: latexSaveState,
    setSaveState: setLatexSaveState,
    queueSave: queueLatexSave,
    flushSave: flushLatexSave,
  } = useAutosave<string>({
    onSave: async (value) => {
      await saveContentAction({ docType: "original_cv", content: value });
      updateSourceDocument("originalCV", value);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to save LaTeX source"),
  });
  const [renderIssue, setRenderIssue] = useState<RenderIssue | null>(null);
  const latexFixPromptTemplate = promptCatalog.fixLatexErrorsAssist?.template ?? "";
  const failedDetail = isFailedVersion
    ? activeVersion?.message || "PDF cannot be generated due to LaTeX errors. Fix the LaTeX above and recompile."
    : null;
  const failedRenderIssue: RenderIssue | null = isFailedVersion
    ? {
        title: "PDF cannot be generated due to LaTeX errors.",
        detail: failedDetail ?? undefined,
        log: activeVersion?.errorLog,
        lineNumbers: activeVersion?.errorLineNumbers?.length ? activeVersion.errorLineNumbers : undefined,
        errors: activeVersion?.errors,
      }
    : null;
  const effectiveRenderIssue = renderIssue ?? failedRenderIssue;

  const lineNumbers = useMemo(() => {
    const lines = latexDraft.split(/\r?\n/);
    if (!lines.length) {
      return [1];
    }
    return lines.map((_, idx) => idx + 1);
  }, [latexDraft]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineNumberRef = useRef<HTMLDivElement | null>(null);
  const lastAutoCompileKey = useRef<string | null>(null);

  const syncLineNumberScroll = () => {
    if (lineNumberRef.current && textareaRef.current) {
      lineNumberRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  useEffect(() => {
    const currentId = virtualVersions[versionIndex]?.generationId ?? null;
    selectedVersionIdRef.current = currentId;
  }, [virtualVersions, versionIndex]);

  useEffect(() => {
    const preferredId = selectedVersionIdRef.current;
    if (preferredId) {
      const nextIndex = virtualVersions.findIndex((entry) => entry.generationId === preferredId);
      if (nextIndex >= 0) {
        if (nextIndex !== versionIndex) {
          setVersionIndex(nextIndex);
        }
        return;
      }
    }
    const nextLength = virtualVersions.length;
    const fallbackIndex = nextLength ? nextLength - 1 : 0;
    if (fallbackIndex !== versionIndex) {
      setVersionIndex(fallbackIndex);
    }
  }, [virtualVersions, payload.storageKey, versionIndex]);

  useEffect(() => {
    setLatexDraft(effectiveContent);
    setLatexSaveState("idle");
    setPreviewVersion((value) => value + 1);
    setPreviewLoading(Boolean(previewUrl));
    setRenderIssue(null);
    setIsAutoFixing(false);
  }, [effectiveContent, previewUrl, setLatexSaveState]);

  const handleCopy = () => {
    if (effectiveContent && typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(effectiveContent);
    }
  };

  const handleCompile = async (options?: { silent?: boolean }) => {
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
      if (!result.ok) {
        const detail = result.errorMessage || "LaTeX compilation failed.";
        setRenderIssue({
          title: "LaTeX compilation failed",
          detail,
          log: result.errorLog,
          lineNumbers: result.errorLineNumbers?.length ? result.errorLineNumbers : undefined,
          errors: result.errors,
        });
        setPreviewLoading(false);
        const lineHint = result.errorLineNumbers?.length ? ` Lines: ${result.errorLineNumbers.join(", ")}.` : "";
        toast.error(`LaTeX compilation failed: ${detail}.${lineHint}`);
        return;
      }

      setRenderIssue(null);
      upsertSession(result.session);
      setPreviewVersion(Date.now());
      setPreviewLoading(true);
      if (!options?.silent) {
        toast.success("CV recompiled.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRenderIssue({
        title: "LaTeX compilation failed",
        detail: message,
      });
      setPreviewLoading(false);
      toast.error(`LaTeX compilation failed: ${message}`);
    } finally {
      setIsCompiling(false);
    }
  };

  const handlePrevVersion = () => {
    if (!virtualVersions.length) return;
    setVersionIndex((index) => Math.max(0, index - 1));
  };

  const handleNextVersion = () => {
    if (!virtualVersions.length) return;
    setVersionIndex((index) => Math.min(virtualVersions.length - 1, index + 1));
  };

  const showOverlaySpinner = previewUrl && !effectiveRenderIssue && !isPendingVersion && (previewLoading || isCompiling);

  useEffect(() => {
    if (!previewUrl) return;
    if (isPendingVersion) return;
    if (isCompiling) return;
    if (!latexDraft.trim()) return;
    const key = `${sessionId ?? "no-session"}|${effectiveGenerationId ?? "no-gen"}|${versionIndex}|${effectiveContent}`;
    if (lastAutoCompileKey.current === key) return;
    lastAutoCompileKey.current = key;
    void handleCompile({ silent: true });
    // We intentionally skip latexDraft in deps to avoid re-compiling on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl, versionIndex, effectiveGenerationId, sessionId, effectiveContent, isPendingVersion, isFailedVersion, isCompiling]);

  const copyErrorsToClipboard = async () => {
    if (!effectiveRenderIssue) {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error("Clipboard not available.");
      return;
    }
    const parts: string[] = [];
    if (effectiveRenderIssue.title) parts.push(effectiveRenderIssue.title);
    if (effectiveRenderIssue.lineNumbers?.length) parts.push(`Line hints: ${effectiveRenderIssue.lineNumbers.join(", ")}`);
    if (effectiveRenderIssue.errors?.length) {
      parts.push(
        "Errors:\n" +
          effectiveRenderIssue.errors
            .map((err) => {
              const hint = err.lineNumbers?.length ? ` (lines ${err.lineNumbers.join(", ")})` : "";
              return `- ${err.message}${hint}`;
            })
            .join("\n"),
      );
    }
    if (effectiveRenderIssue.detail) parts.push(effectiveRenderIssue.detail);
    if (effectiveRenderIssue.log) parts.push(`Log excerpt:\n${effectiveRenderIssue.log}`);
    const text = parts.join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Errors copied to clipboard.");
    } catch {
      toast.error("Unable to copy errors. Copy manually.");
    }
  };

  const copyFixPromptToClipboard = async () => {
    if (!latexFixPromptTemplate) {
      toast.error("Fix prompt template unavailable.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error("Clipboard not available.");
      return;
    }
    const errorSummary = effectiveRenderIssue?.errors?.length
      ? effectiveRenderIssue.errors
          .map((err) => {
            const hint = err.lineNumbers?.length ? ` (lines ${err.lineNumbers.join(", ")})` : "";
            return `- ${err.message}${hint}`;
          })
          .join("\n")
      : effectiveRenderIssue?.detail ?? "";
    const compilerLog = effectiveRenderIssue?.log ?? effectiveRenderIssue?.detail ?? "";
    const filled = latexFixPromptTemplate
      .replace(/\{\{latexSource\}\}/g, latexDraft)
      .replace(/\{\{errorSummary\}\}/g, errorSummary)
      .replace(/\{\{compilerLog\}\}/g, compilerLog);
    try {
      await navigator.clipboard.writeText(filled);
      toast.success("AI fix prompt copied.");
    } catch {
      toast.error("Unable to copy prompt. Copy manually.");
    }
  };

  const buildErrorSummary = (issue: RenderIssue | null): string => {
    if (!issue) return "";
    const parts: string[] = [];
    if (issue.errors?.length) {
      parts.push(
        issue.errors
          .map((err) => {
            const hint = err.lineNumbers?.length ? ` (lines ${err.lineNumbers.join(", ")})` : "";
            return `- ${err.message}${hint}`;
          })
          .join("\n"),
      );
    }
    if (issue.lineNumbers?.length) {
      parts.push(`Line hints: ${issue.lineNumbers.join(", ")}`);
    }
    if (issue.detail) {
      parts.push(issue.detail);
    }
    return parts.filter(Boolean).join("\n");
  };

  const handleAutoFix = async () => {
    if (!effectiveRenderIssue) {
      toast.error("No LaTeX errors to auto-fix.");
      return;
    }
    if (!sessionId) {
      toast.error("Select a session first.");
      return;
    }
    if (isCompiling || isAutoFixing) {
      return;
    }
    const issue = effectiveRenderIssue;
    const summary = buildErrorSummary(issue) || "LaTeX compilation failed.";
    const logExcerpt = issue?.log ?? issue?.detail ?? "";
    setIsAutoFixing(true);
    try {
      const result = await autoFixCvAction({
        sessionId,
        latex: latexDraft,
        generationId: effectiveGenerationId,
        errorSummary: summary,
        compilerLog: logExcerpt,
      });

      if (!result.ok) {
        const lineHint = result.errorLineNumbers?.length ? ` Lines: ${result.errorLineNumbers.join(", ")}.` : "";
        setRenderIssue({
          title: "Auto-fix failed",
          detail: result.errorMessage,
          log: result.errorLog,
          lineNumbers: result.errorLineNumbers,
          errors: result.errors,
        });
        const attemptsLabel = `${result.attempts} attempt${result.attempts === 1 ? "" : "s"}`;
        toast.error(`Auto-fix failed after ${attemptsLabel}. ${result.errorMessage || "No compiler details."}${lineHint}`.trim());
        return;
      }

      upsertSession(result.session);
      setLatexDraft(result.latex);
      setRenderIssue(null);
      setPreviewVersion(Date.now());
      setPreviewLoading(true);
      toast.success(`Auto-fix succeeded after ${result.attempts} attempt${result.attempts > 1 ? "s" : ""}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Auto-fix failed: ${message}`);
    } finally {
      setIsAutoFixing(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            <FontAwesomeIcon icon={icon} />
            {label}
          </div>
          <div className="flex gap-2">
            {downloadUrl && !isPendingVersion ? (
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
      {isPendingVersion ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2 md:items-start md:gap-6">
          <div className="flex h-full flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">LaTeX Source</p>
              <span className="inline-block h-8 w-16" aria-hidden="true" />
            </div>
            <div className="flex h-[26rem] items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-400">
              Waiting for LaTeX output...
            </div>
            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">Auto-saves to your workspace; compile to refresh the PDF preview.</p>
          </div>
          <div className="flex h-full flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">PDF Preview</p>
              <span className="inline-block h-8 w-16" aria-hidden="true" />
            </div>
            <div className="relative flex h-[26rem] items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-col items-center justify-center gap-3 text-center">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-zinc-400/70 border-t-transparent text-zinc-500 dark:border-zinc-500/80 dark:text-zinc-300 animate-spin"
                  aria-hidden="true"
                >
                  <span className="text-base">↻</span>
                </div>
                <p className="font-semibold">Generation in progress...</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Switch to earlier versions to keep reading while this finishes.</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">Recompile after edits to refresh the preview.</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 md:items-start md:gap-6">
          <div className="flex h-full flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">LaTeX Source</p>
              <button
                type="button"
                onClick={() => void handleCompile()}
                disabled={isCompiling}
                className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-400"
              >
                {isCompiling ? "Compiling..." : "Compile"}
              </button>
            </div>
            <div className="relative h-[26rem]">
              <div
                ref={lineNumberRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-12 select-none overflow-hidden rounded-l-xl border border-r border-zinc-200 bg-zinc-100 px-2 py-2 text-right font-mono text-[11px] leading-5 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
              >
                {lineNumbers.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                value={latexDraft}
                onChange={(event) => {
                  const next = event.target.value;
                  setLatexDraft(next);
                  queueLatexSave(next);
                }}
                onBlur={() => flushLatexSave()}
                onScroll={syncLineNumberScroll}
                className="h-full w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 pl-14 pr-3 py-2 font-mono text-xs font-normal text-zinc-800 shadow-inner focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                spellCheck={false}
              />
            </div>
            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
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
            <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
              {effectiveRenderIssue ? (
                <div className="absolute right-3 top-3 z-20 flex gap-2">
                  <button
                    type="button"
                    onClick={handleAutoFix}
                    disabled={isAutoFixing || isCompiling}
                    className="rounded-full border border-emerald-200 bg-emerald-600/90 px-3 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur-sm transition hover:bg-emerald-600 disabled:opacity-60 dark:border-emerald-700 dark:bg-emerald-500/80 dark:hover:bg-emerald-500"
                  >
                    {isAutoFixing ? "Auto-fixing..." : "Auto-fix"}
                  </button>
                  <button
                    type="button"
                    onClick={copyFixPromptToClipboard}
                    className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm backdrop-blur-sm transition hover:border-emerald-300 hover:text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200 dark:hover:border-emerald-500"
                  >
                    Copy AI fix prompt
                  </button>
                </div>
              ) : null}
              <div className="h-[26rem] w-full overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
                {effectiveRenderIssue ? (
                  <div className="relative flex h-full flex-col items-center justify-center gap-3 px-5 text-center">
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">{effectiveRenderIssue.title}</p>
                    <p className="text-xs text-red-600 dark:text-red-200">Fix the errors below and recompile.</p>
                    <div className="w-full max-w-full space-y-2 rounded-lg border border-red-200 bg-red-50/80 p-3 text-left text-xs text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-200">
                      <button
                        type="button"
                        onClick={copyErrorsToClipboard}
                        className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-red-200 bg-white/80 px-2 py-1 text-[11px] font-semibold text-red-700 shadow-sm backdrop-blur-sm transition hover:border-red-300 hover:text-red-800 dark:border-red-700 dark:bg-red-900/50 dark:text-red-100"
                      >
                        <FontAwesomeIcon icon={faCopy} />
                        Copy errors
                      </button>
                      {effectiveRenderIssue.lineNumbers?.length ? (
                        <p className="font-semibold">Line hints: {effectiveRenderIssue.lineNumbers.join(", ")}</p>
                      ) : null}
                      {effectiveRenderIssue.errors?.length ? (
                        <ul className="list-disc space-y-1 pl-5">
                          {effectiveRenderIssue.errors.map((err, idx) => (
                            <li key={`${err.message}-${idx}`} className="leading-5">
                              <span className="font-semibold">Error:</span> {err.message}
                              {err.lineNumbers?.length ? ` (lines ${err.lineNumbers.join(", ")})` : ""}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {effectiveRenderIssue.detail ? <pre className="whitespace-pre-wrap font-mono text-[11px] leading-5">{effectiveRenderIssue.detail}</pre> : null}
                      {effectiveRenderIssue.log ? (
                        <pre className="max-h-40 whitespace-pre-wrap overflow-auto rounded-md bg-white/70 p-2 font-mono text-[11px] leading-5 text-red-700 shadow-inner dark:bg-zinc-900/60 dark:text-red-200">
                          {effectiveRenderIssue.log}
                        </pre>
                      ) : null}
                    </div>
                  </div>
                ) : previewUrl ? (
                  <iframe
                    src={`${previewUrlWithBust ?? previewUrl}#toolbar=0&view=FitH`}
                    title={`${label} preview`}
                    className="h-full w-full"
                    onLoad={() => {
                      setPreviewLoading(false);
                      setRenderIssue(null);
                    }}
                    onError={() => {
                      setPreviewLoading(false);
                      setRenderIssue({ title: "Preview failed to render.", detail: "Recompile to retry." });
                    }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-600 dark:text-zinc-300">
                    Add LaTeX and compile to generate a preview.
                  </div>
                )}
              </div>
              {showOverlaySpinner ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gradient-to-b from-white/60 to-white/30 dark:from-zinc-900/60 dark:to-zinc-900/30">
                  <div className="h-10 w-10 rounded-full border-2 border-zinc-500/70 dark:border-zinc-400/80" />
                </div>
              ) : null}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Recompile after edits to refresh the preview.</p>
          </div>
        </div>
      )}
      {virtualVersions.length > 0 ? (
        <div className="mt-3 flex justify-end">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            <button
              type="button"
              onClick={handlePrevVersion}
              disabled={versionIndex <= 0}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed hover:border-zinc-400 dark:hover:border-zinc-600"
              title="Previous version"
            >
              ◀
            </button>
            <span>{`${Math.min(versionIndex + 1, virtualVersions.length)}/${virtualVersions.length || 1}`}</span>
            <button
              type="button"
              onClick={handleNextVersion}
              disabled={versionIndex >= virtualVersions.length - 1}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed hover:border-zinc-400 dark:hover:border-zinc-600"
              title="Next version"
            >
              ▶
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
