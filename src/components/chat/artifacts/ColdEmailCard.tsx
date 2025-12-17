'use client';

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faEnvelope } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import type { ArtifactPayload } from "@/hooks/useStreamableValue";

export type ColdEmailCardProps = {
  icon: IconDefinition;
  payload: ArtifactPayload;
};

export function ColdEmailCard({ icon, payload }: ColdEmailCardProps) {
  const toAddress = payload.toAddress || payload.emailAddresses?.[0] || "hello@example.com";
  const subject = payload.subject || "Warm introduction";
  const body = payload.body || payload.content;
  const mailto = buildMailtoLink(toAddress, subject, body);
  const downloadUrl = buildSecureDownloadUrl(payload, { disposition: "attachment" });

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          <FontAwesomeIcon icon={icon} />
          Cold Email
        </div>
        <div className="flex gap-2">
          <a
            href={mailto}
            className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 flex items-center gap-2"
          >
            <FontAwesomeIcon icon={faEnvelope} />
            <span className="hidden sm:inline">Compose Email</span>
          </a>
          {downloadUrl ? (
            <a
              href={downloadUrl}
              className="rounded-full border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-2"
              download="cold-email.txt"
            >
              <FontAwesomeIcon icon={faDownload} />
              <span className="hidden sm:inline">Raw TXT</span>
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
    <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-3">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        <span>{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-zinc-500 dark:text-zinc-400 transition hover:text-zinc-900 dark:hover:text-zinc-100"
          title="Copy"
        >
          Copy
        </button>
      </div>
      {multiline ? (
        <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">{value}</pre>
      ) : (
        <p className="mt-2 truncate text-sm text-zinc-800 dark:text-zinc-200">{value}</p>
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
