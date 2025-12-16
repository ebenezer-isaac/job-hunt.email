'use client';

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";
import type { ArtifactPayload } from "@/hooks/useStreamableValue";
import { saveContentAction } from "@/app/actions/save-content";
import { useSessionStore } from "@/store/session-store";

export type TextArtifactCardProps = {
  label: string;
  icon: IconDefinition;
  payload: ArtifactPayload;
  isSessionGenerating: boolean;
};

export function TextArtifactCard({ label, icon, payload, isSessionGenerating }: TextArtifactCardProps) {
  const isPdf = payload.mimeType === "application/pdf";
  const versions = payload.versions ?? [];
  const hasPendingVersion = isSessionGenerating && versions.length === 0;
  const virtualVersions = hasPendingVersion
    ? [...versions, { generationId: "__pending__", content: "", status: "processing" }]
    : versions;
  const [versionIndex, setVersionIndex] = useState<number>(virtualVersions.length ? virtualVersions.length - 1 : 0);
  const activeVersion = virtualVersions[versionIndex] ?? null;
  const isPendingVersion = activeVersion?.generationId === "__pending__";
  const effectiveContent = activeVersion?.content ?? payload.content ?? "";
  const isCoverLetter = label === "Cover Letter";
  const isEditableCoverLetter = isCoverLetter;
  const { updateSourceDocument } = useSessionStore((state) => state.actions);
  const [draftContent, setDraftContent] = useState<string>(effectiveContent);
  const [isEditing, setIsEditing] = useState(isEditableCoverLetter);
  const [coverSaveState, setCoverSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
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

  const debouncedSaveCoverLetter = useDebouncedCallback((value: string) => {
    setCoverSaveState("saving");
    saveContentAction({ docType: "cover_letter", content: value })
      .then(() => {
        updateSourceDocument("coverLetter", value);
        setCoverSaveState("saved");
      })
      .catch((error) => {
        setCoverSaveState("error");
        toast.error(error instanceof Error ? error.message : "Unable to save cover letter");
      });
  }, 800);

  useEffect(() => {
    const nextLength = virtualVersions.length;
    setVersionIndex(nextLength ? nextLength - 1 : 0);
  }, [virtualVersions.length, payload.storageKey, hasPendingVersion]);

  useEffect(() => {
    setPreviewVersion((value) => value + 1);
    setPreviewLoading(Boolean(previewUrl && isPdf));
    setPreviewError(null);
  }, [effectiveContent, previewUrl, isPdf]);

  useEffect(() => {
    if (!isEditableCoverLetter) return;
    const currentId = activeVersion?.generationId ?? payload.generationId ?? null;
    const versionChanged = currentId !== lastVersionIdRef.current;
    if (versionChanged || !isEditing) {
      setDraftContent(effectiveContent);
      setCoverSaveState("idle");
      lastVersionIdRef.current = currentId;
    }
  }, [activeVersion?.generationId, payload.generationId, effectiveContent, isEditableCoverLetter, isEditing]);

  const handleCopy = () => {
    if (displayedContent && typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(displayedContent);
    }
  };

  const handlePrevVersion = () => {
    if (!virtualVersions.length) return;
    setVersionIndex((index) => (index - 1 + virtualVersions.length) % virtualVersions.length);
  };

  const handleNextVersion = () => {
    if (!virtualVersions.length) return;
    setVersionIndex((index) => (index + 1) % virtualVersions.length);
  };

  const showSpinner =
    !isEditableCoverLetter && ((previewLoading && !previewError) || isPendingVersion || (isSessionGenerating && versions.length === 0 && !previewError));

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          <FontAwesomeIcon icon={icon} />
          {label}
        </div>
        {virtualVersions.length > 0 ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            <button
              type="button"
              onClick={handlePrevVersion}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:border-zinc-400 dark:hover:border-zinc-600"
              title="Previous version"
            >
              ◀
            </button>
            <span>{`${Math.min(versionIndex + 1, virtualVersions.length)}/${virtualVersions.length || 1}`}</span>
            <button
              type="button"
              onClick={handleNextVersion}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:border-zinc-400 dark:hover:border-zinc-600"
              title="Next version"
            >
              ▶
            </button>
            {isSessionGenerating && versionIndex === virtualVersions.length - 1 ? (
              <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border border-emerald-500 border-t-transparent" />
                Generating
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="flex gap-2">
          {isEditableCoverLetter ? (
            <button
              type="button"
              className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 transition hover:text-zinc-900 dark:hover:text-zinc-100"
              onClick={() => setIsEditing((value) => !value)}
            >
              {isEditing ? "Done" : "Edit"}
            </button>
          ) : null}
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
        <div className="mt-4 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-900/20 p-6">
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Generation in progress…</p>
            <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">You can keep reading earlier versions while this finishes.</p>
          </div>
        </div>
      ) : isEditableCoverLetter && isEditing ? (
        <div className="space-y-2">
          <textarea
            value={draftContent}
            onChange={(event) => {
              const next = event.target.value;
              setDraftContent(next);
              setCoverSaveState("saving");
              debouncedSaveCoverLetter(next);
            }}
            onBlur={() => debouncedSaveCoverLetter.flush?.()}
            className="mt-3 h-[26rem] w-full overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800 shadow-inner focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
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
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
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
          <pre className="mt-3 h-[26rem] overflow-y-auto whitespace-pre-wrap rounded-xl bg-zinc-50 dark:bg-zinc-800 p-4 text-xs text-zinc-700 dark:text-zinc-300 font-normal">
            {displayedContent}
          </pre>
          {showSpinner ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-gradient-to-b from-white/60 to-white/30 dark:from-zinc-900/60 dark:to-zinc-900/30">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            </div>
          ) : null}
        </div>
      )}
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
