'use client';

import { useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { useSessionStore } from "@/store/session-store";
import type { ArtifactPayload } from "@/hooks/useStreamableValue";

export function ChatView() {
  const chatHistory = useSessionStore((state) => state.chatHistory);
  const generatedDocuments = useSessionStore((state) => state.generatedDocuments);
  const isGenerating = useSessionStore((state) => state.isGenerating);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    containerRef.current.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatHistory.length, generatedDocuments]);

  const hasMessages = chatHistory.length > 0;

  return (
    <div className="flex-1 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
      <div ref={containerRef} className="h-full overflow-y-auto px-6 py-6">
        {!hasMessages ? <WelcomePanel /> : null}
        {chatHistory.map((message) => (
          <article key={message.id} className="mb-4 flex gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-lg">
              {message.role === "user" ? "👤" : message.level === "error" ? "⚠️" : "🤖"}
            </div>
            <div className="flex-1 rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span className="font-semibold uppercase tracking-wide text-zinc-400">{message.role}</span>
                <time>{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
              </div>
              <div className="prose prose-zinc mt-2 text-sm leading-relaxed">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            </div>
          </article>
        ))}
        {isGenerating ? (
          <div className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            <span className="relative flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zinc-400 opacity-75" />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-zinc-500" />
            </span>
            <span className="font-medium">Generating tailored documents…</span>
          </div>
        ) : null}
        {generatedDocuments ? <ArtifactsPanel /> : null}
      </div>
    </div>
  );
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
  const downloadUrl = buildSecureDownloadUrl(payload);
  const metadataLines = [
    payload.mimeType ? `Type: ${payload.mimeType}` : null,
    payload.pageCount ? `Pages: ${payload.pageCount}` : null,
    payload.emailAddresses?.length ? `Emails: ${payload.emailAddresses.join(", ")}` : null,
  ].filter(Boolean);

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
      {isPdf && payload.downloadUrl ? (
        <div className="mt-3 space-y-3">
          <iframe
            src={`${payload.downloadUrl}#toolbar=0&view=FitH`}
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
  const downloadUrl = buildSecureDownloadUrl(payload);

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

function buildSecureDownloadUrl(payload: ArtifactPayload): string | null {
  if (payload.storageKey) {
    return `/api/download?key=${encodeURIComponent(payload.storageKey)}`;
  }
  return payload.downloadUrl ?? null;
}
