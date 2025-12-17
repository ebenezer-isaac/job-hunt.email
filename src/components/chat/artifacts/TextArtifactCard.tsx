'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import type { ArtifactPayload } from "@/hooks/useStreamableValue";
import { saveContentAction } from "@/app/actions/save-content";
import { useSessionStore } from "@/store/session-store";
import { useAutosave } from "@/hooks/useAutosave";

export type TextArtifactCardProps = {
  label: string;
  icon: IconDefinition;
  payload: ArtifactPayload;
  isSessionGenerating: boolean;
};

export function TextArtifactCard({ label, icon, payload, isSessionGenerating }: TextArtifactCardProps) {
  const isPdf = payload.mimeType === "application/pdf";
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
  const hasPendingVersion = isSessionGenerating;
  const hasProcessingVersion = normalizedVersions.some((version) => version.status === "processing");
  const [pendingLatched, setPendingLatched] = useState<boolean>(hasPendingVersion || hasProcessingVersion);
  useEffect(() => {
    if (hasPendingVersion || hasProcessingVersion) {
      setPendingLatched(true);
    } else {
      setPendingLatched(false);
    }
  }, [hasPendingVersion, hasProcessingVersion]);
  const virtualVersions = useMemo(
    () =>
      pendingLatched
        ? [...normalizedVersions, { generationId: "__pending__", content: "", status: "processing" }]
        : normalizedVersions,
    [normalizedVersions, pendingLatched],
  );
  const [versionIndex, setVersionIndex] = useState<number>(virtualVersions.length ? virtualVersions.length - 1 : 0);
  const selectedVersionIdRef = useRef<string | null>(virtualVersions[versionIndex]?.generationId ?? null);
  const activeVersion = virtualVersions[versionIndex] ?? null;
  const isPendingVersion = activeVersion?.generationId === "__pending__";
  const effectiveContent = activeVersion?.content ?? payload.content ?? "";
  const isCoverLetter = label === "Cover Letter";
  const isEditableCoverLetter = isCoverLetter;
  const { updateSourceDocument } = useSessionStore((state) => state.actions);
  const [draftContent, setDraftContent] = useState<string>(effectiveContent);
  const {
    saveState: coverSaveState,
    setSaveState: setCoverSaveState,
    queueSave: queueCoverSave,
    flushSave: flushCoverSave,
  } = useAutosave<string>({
    onSave: async (value) => {
      await saveContentAction({ docType: "cover_letter", content: value });
      updateSourceDocument("coverLetter", value);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to save cover letter"),
  });
  const lastVersionIdRef = useRef<string | null>(activeVersion?.generationId ?? payload.generationId ?? null);
  const displayedContent = isEditableCoverLetter ? draftContent : effectiveContent;
  const canCopy = Boolean(displayedContent.trim().length) && !isPendingVersion;
  const downloadName = payload.mimeType === "application/msword" ? "cover-letter.doc" : undefined;
  const previewUrl = isPendingVersion ? null : buildSecureDownloadUrl(payload, { disposition: "inline" });
  const downloadUrl = isPendingVersion ? null : buildSecureDownloadUrl(payload, { disposition: "attachment" }) ?? previewUrl;
  const [previewVersion, setPreviewVersion] = useState<number>(0);
  const previewUrlWithBust = previewUrl ? `${previewUrl}${previewUrl.includes("?") ? "&" : "?"}v=${previewVersion}` : null;
  const [previewLoading, setPreviewLoading] = useState<boolean>(Boolean(previewUrl && isPdf));
  const [previewError, setPreviewError] = useState<string | null>(null);
  const metadataLines = [
    payload.mimeType ? `Type: ${payload.mimeType}` : null,
    payload.pageCount ? `Pages: ${payload.pageCount}` : null,
    payload.emailAddresses?.length ? `Emails: ${payload.emailAddresses.join(", ")}` : null,
  ].filter(Boolean);
  const changeSummary = payload.changeSummary?.trim() ?? "";

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
  }, [virtualVersions, payload.storageKey, hasPendingVersion, versionIndex]);

  useEffect(() => {
    setPreviewVersion((value) => value + 1);
    setPreviewLoading(Boolean(previewUrl && isPdf));
    setPreviewError(null);
  }, [effectiveContent, previewUrl, isPdf]);

  useEffect(() => {
    if (!isEditableCoverLetter) return;
    const currentId = activeVersion?.generationId ?? payload.generationId ?? null;
    const versionChanged = currentId !== lastVersionIdRef.current;
    if (versionChanged) {
      setDraftContent(effectiveContent);
      setCoverSaveState("idle");
      lastVersionIdRef.current = currentId;
    }
  }, [activeVersion?.generationId, payload.generationId, effectiveContent, isEditableCoverLetter, setCoverSaveState]);

  const handleCopy = () => {
    if (displayedContent && typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(displayedContent);
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

  const showSpinner =
    !isEditableCoverLetter && ((previewLoading && !previewError) || isPendingVersion || (isSessionGenerating && versions.length === 0 && !previewError));

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            <FontAwesomeIcon icon={icon} />
            {label}
          </div>
          <div className="flex gap-2 items-start">
            {downloadUrl && !isPendingVersion ? (
              <a
                href={downloadUrl}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 transition hover:text-emerald-800 dark:hover:text-emerald-300 flex items-center gap-1"
                download={downloadName}
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
      {metadataLines.length ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{metadataLines.join(" · ")}</p>
      ) : null}
      {label === "CV" && changeSummary ? (
        <div className="mt-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50 dark:bg-emerald-900/10 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Changes Made</p>
          <div className="prose prose-sm mt-2 text-sm text-emerald-800 dark:text-emerald-200 prose-headings:block prose-headings:w-full">
            <ReactMarkdown>{changeSummary}</ReactMarkdown>
          </div>
        </div>
      ) : null}
      {isPendingVersion ? (
        isCoverLetter ? (
          <div className="space-y-2">
            <div className="mt-3 relative flex h-[28rem] items-center justify-center overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 p-6 text-sm text-zinc-600 shadow-inner dark:border-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-300">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-zinc-500/70 border-t-transparent dark:border-zinc-500/80 animate-spin" aria-hidden="true">
                  <span className="text-base">↻</span>
                </div>
                <p className="font-semibold text-zinc-800 dark:text-zinc-100">Generating your cover letter…</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">You can switch to earlier versions while this finishes.</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">Auto-saves to your workspace. Status: generating…</p>
          </div>
        ) : (
          <div className="mt-2 grid gap-4 md:grid-cols-2 md:items-start md:gap-6" style={{ minHeight: '28rem' }}>
            <div className="flex h-full flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Document</p>
                <span className="inline-block h-8 w-16" aria-hidden="true" />
              </div>
              <div className="flex h-[26rem] items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-400">
                Waiting for generated text...
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Auto-saves while you work; your PDF preview updates after generation finishes.</p>
            </div>
            <div className="flex h-full flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">PDF Preview</p>
                <span className="inline-block h-8 w-16" aria-hidden="true" />
              </div>
              <div className="relative flex h-[26rem] items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-col items-center justify-center gap-3 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-zinc-400/70 border-t-transparent text-zinc-500 dark:border-zinc-500/80 dark:text-zinc-300 animate-spin" aria-hidden="true">
                    <span className="text-base">↻</span>
                  </div>
                  <p className="font-semibold">Generation in progress...</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Switch to earlier versions to keep reading while this finishes.</p>
                </div>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Recompile after edits to refresh the preview.</p>
            </div>
          </div>
        )
      ) : isEditableCoverLetter ? (
          <div className="space-y-2">
          <textarea
            value={draftContent}
            onChange={(event) => {
              const next = event.target.value;
              setDraftContent(next);
              queueCoverSave(next);
            }}
            onBlur={() => flushCoverSave()}
            className="mt-3 h-[28rem] w-full overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800 shadow-inner focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            Auto-saves to your workspace. Status: {coverSaveState === "saving" && "Saving..."}
            {coverSaveState === "saved" && "Saved"}
            {coverSaveState === "error" && "Save failed"}
            {coverSaveState === "idle" && "Idle"}
          </div>
        </div>
      ) : isPdf && previewUrl ? (
        <div className="mt-3 space-y-3">
          <div className="relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800">
            <div className="h-[26rem] w-full overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
              <iframe
                src={`${previewUrlWithBust ?? previewUrl}#toolbar=0&view=FitH`}
                title={`${label} preview`}
                className="h-full w-full"
                onLoad={() => setPreviewLoading(false)}
                onError={() => {
                  setPreviewLoading(false);
                  setPreviewError("Preview failed to render. Regenerate to retry.");
                }}
              />
            </div>
            {showSpinner ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gradient-to-b from-white/60 to-white/30 dark:from-zinc-900/60 dark:to-zinc-900/30">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-zinc-500/80 dark:border-zinc-400/80 border-t-transparent animate-spin">
                  <span className="text-base">↻</span>
                </div>
              </div>
            ) : null}
          </div>
          {previewError ? (
            <div className="rounded-md bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-200">
              {previewError}
            </div>
          ) : null}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Rendering PDF preview. Use Download for the full-resolution copy.
          </p>
        </div>
      ) : (
        <div className="relative">
          <pre className="mt-3 h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-xl bg-zinc-50 dark:bg-zinc-800 p-4 text-xs text-zinc-700 dark:text-zinc-300 font-normal">
            {displayedContent}
          </pre>
          {showSpinner ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-gradient-to-b from-white/60 to-white/30 dark:from-zinc-900/60 dark:to-zinc-900/30">
              <div className="h-8 w-8 rounded-full border-2 border-zinc-500/80 dark:border-zinc-400/80" />
            </div>
          ) : null}
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
