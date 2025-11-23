'use client';

import { useEffect, useRef, useState } from "react";
import { useChat, type ChatInput, type ChatResult } from "@/hooks/useChat";
import { ChatView } from "@/components/chat/ChatView";
import { useSessionStore, type ClientSession } from "@/store/session-store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFire, faSnowflake } from "@fortawesome/free-solid-svg-icons";

export function ChatInterface() {
  const { sendMessage, isGenerating } = useChat();
  const mode = useSessionStore((state) => state.mode);
  const sessions = useSessionStore((state) => state.sessions);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const actions = useSessionStore((state) => state.actions);

  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [hasGeneratedInSession, setHasGeneratedInSession] = useState(false);
  const lastPayloadRef = useRef<ChatInput | null>(null);
  const lastSessionIdRef = useRef<string | null>(null);
  const preserveFormRef = useRef(false);

  const applyResultPayload = (result: ChatResult) => {
    setCompanyName(result.companyName);
    setJobTitle(result.jobTitle);
    if (typeof result.companyWebsite === "string") {
      setCompanyWebsite(result.companyWebsite);
    }
    if (typeof result.contactName === "string") {
      setContactName(result.contactName);
    }
    if (typeof result.contactTitle === "string") {
      setContactTitle(result.contactTitle);
    }
    if (typeof result.contactEmail === "string") {
      setContactEmail(result.contactEmail);
    }
    setIsFormDirty(false);
  };

  const handleSuccessfulResult = (result: ChatResult) => {
    applyResultPayload(result);
    setRetryAvailable(false);
    setJobDescription("");
    lastPayloadRef.current = null;
    setHasGeneratedInSession(true);
  };

  const markDirty = () => {
    if (!isFormDirty) {
      setIsFormDirty(true);
    }
  };

  useEffect(() => {
    const applySessionState = (
      session: ClientSession | null,
      options: { resetRetry: boolean; resetDirty: boolean },
    ) => {
      if (!session) {
        setCompanyName("");
        setJobTitle("");
        setCompanyWebsite("");
        setContactName("");
        setContactTitle("");
        setContactEmail("");
        setHasGeneratedInSession(false);
      } else {
        const metadata = (session.metadata ?? {}) as Record<string, unknown>;
        const readString = (key: string) => {
          const value = metadata[key];
          return typeof value === "string" ? value : "";
        };
        const preferContactValue = (primaryKey: string, legacyKey: string) => {
          const primary = readString(primaryKey).trim();
          if (primary) {
            return primary;
          }
          return readString(legacyKey).trim();
        };

        setCompanyName(readString("companyName"));
        setJobTitle(readString("jobTitle"));
        setCompanyWebsite(readString("companyWebsite") || readString("jobSourceUrl"));
        setContactName(preferContactValue("contactName", "targetPersonName"));
        setContactTitle(preferContactValue("contactTitle", "targetPersonTitle"));
        setContactEmail(preferContactValue("contactEmail", "targetPersonEmail"));
        setHasGeneratedInSession(Boolean(session.metadata?.lastGeneratedAt));
      }
      if (options.resetRetry) {
        setRetryAvailable(false);
        setIsRetrying(false);
        lastPayloadRef.current = null;
      }
      if (options.resetDirty) {
        setIsFormDirty(false);
      }
    };

    const sessionChanged = currentSessionId !== lastSessionIdRef.current;

    if (!currentSessionId) {
      lastSessionIdRef.current = null;
      if (preserveFormRef.current) {
        preserveFormRef.current = false;
        return;
      }
      if (!isFormDirty) {
        applySessionState(null, { resetRetry: true, resetDirty: true });
      }
      return;
    }

    const session = sessions.find((item) => item.id === currentSessionId) ?? null;
    if (!session) {
      return;
    }

    if (sessionChanged) {
      lastSessionIdRef.current = currentSessionId;
      applySessionState(session, { resetRetry: true, resetDirty: true });
      return;
    }

    if (!isFormDirty) {
      applySessionState(session, { resetRetry: false, resetDirty: false });
    }
  }, [currentSessionId, sessions, isFormDirty]);

  const isColdOutreach = mode === "cold_outreach";
  const placeholder = isColdOutreach
    ? "Enter company intel or target URL for outreach..."
    : "Paste job description or URL...";
  const jobDescriptionRequired = !isColdOutreach;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyName.trim() || !jobTitle.trim()) {
      return;
    }
    if (isColdOutreach && !companyWebsite.trim()) {
      return;
    }
    if (jobDescriptionRequired && !jobDescription.trim()) {
      return;
    }
    const mainContent = document.getElementById("main-content");
    if (mainContent) {
      mainContent.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setRetryAvailable(false);
    const payload: ChatInput = {
      jobDescription,
      companyName,
      jobTitle,
      companyWebsite,
      contactName,
      contactTitle,
      contactEmail,
    };
    lastPayloadRef.current = payload;
    const result = await sendMessage(payload);
    if (result) {
      handleSuccessfulResult(result);
      return;
    }
    setRetryAvailable(true);
    setJobDescription(payload.jobDescription);
    setIsFormDirty(true);
  };

  const handleRetry = async () => {
    if (!lastPayloadRef.current) {
      return;
    }
    setRetryAvailable(false);
    setIsRetrying(true);
    const result = await sendMessage(lastPayloadRef.current);
    setIsRetrying(false);
    if (result) {
      handleSuccessfulResult(result);
      return;
    }
    setRetryAvailable(true);
    setJobDescription(lastPayloadRef.current.jobDescription);
    setIsFormDirty(true);
  };

  const dumpColdFieldsIntoDescription = () => {
    const contextLines: string[] = [];
    const websiteValue = companyWebsite.trim();
    const nameValue = contactName.trim();
    const titleValue = contactTitle.trim();
    const emailValue = contactEmail.trim();
    if (websiteValue) {
      contextLines.push(`Company website: ${websiteValue}`);
    }
    if (nameValue) {
      contextLines.push(`Contact: ${nameValue}${titleValue ? ` (${titleValue})` : ""}`);
    }
    if (emailValue) {
      contextLines.push(`Contact email: ${emailValue}`);
    }
    if (!contextLines.length) {
      return;
    }
    setJobDescription((prev) => {
      const segment = `Additional outreach context:\n${contextLines.join("\n")}`;
      return prev ? `${prev.trim()}\n\n${segment}` : segment;
    });
    setCompanyWebsite("");
    setContactName("");
    setContactTitle("");
    setContactEmail("");
    setIsFormDirty(true);
  };

  const toggleMode = () => {
    const nextMode = isColdOutreach ? "standard" : "cold_outreach";
    if (isColdOutreach) {
      dumpColdFieldsIntoDescription();
    }
    actions.setMode(nextMode);
    if (currentSessionId && hasGeneratedInSession) {
      preserveFormRef.current = true;
      actions.selectSession(null);
      actions.setChatHistory([]);
      actions.setGeneratedDocuments(null, null);
      setHasGeneratedInSession(false);
      setRetryAvailable(false);
      setIsRetrying(false);
      lastPayloadRef.current = null;
    }
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <ChatView />
      <form onSubmit={handleSubmit} className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-400">Mode</p>
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {mode === "standard" ? "Standard Application" : "Cold Outreach"}
            </p>
          </div>
          <ModeToggle mode={mode} onToggle={toggleMode} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Company Name
            <input
              type="text"
              value={companyName}
              onChange={(event) => {
                markDirty();
                setCompanyName(event.target.value);
              }}
              className="mt-1 w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none"
              placeholder="Google"
              required
            />
          </label>
          <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Role / Job Title
            <input
              type="text"
              value={jobTitle}
              onChange={(event) => {
                markDirty();
                setJobTitle(event.target.value);
              }}
              className="mt-1 w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none"
              placeholder="Software Developer"
              required
            />
          </label>
        </div>
        {isColdOutreach ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-zinc-700">
              Company Website
              <input
                type="text"
                value={companyWebsite}
                onChange={(event) => {
                  markDirty();
                  setCompanyWebsite(event.target.value);
                }}
                className="mt-1 w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none"
                placeholder="https://google.com/careers"
                required={isColdOutreach}
              />
            </label>
            <label className="text-sm font-semibold text-zinc-700">
              Contact Name
              <input
                type="text"
                value={contactName}
                onChange={(event) => {
                  markDirty();
                  setContactName(event.target.value);
                }}
                className="mt-1 w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none"
                placeholder="Sundar Pichai"
              />
            </label>
            <label className="text-sm font-semibold text-zinc-700">
              Contact Title
              <input
                type="text"
                value={contactTitle}
                onChange={(event) => {
                  markDirty();
                  setContactTitle(event.target.value);
                }}
                className="mt-1 w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none"
                placeholder="CEO"
              />
            </label>
            <label className="text-sm font-semibold text-zinc-700">
              Contact Email
              <input
                type="email"
                value={contactEmail}
                onChange={(event) => {
                  markDirty();
                  setContactEmail(event.target.value);
                }}
                className="mt-1 w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none"
                placeholder="sundar@google.com"
              />
            </label>
          </div>
        ) : null}
        <label className="mt-4 block text-sm font-semibold text-zinc-700">
          Job Description or URL
          <textarea
            value={jobDescription}
            onChange={(event) => {
              markDirty();
              setJobDescription(event.target.value);
            }}
            placeholder={placeholder}
            rows={6}
            required={jobDescriptionRequired}
            className="mt-2 w-full resize-none rounded-3xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none"
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
          <p>
            {isColdOutreach 
              ? "Tip: Paste a URL in cold mode to trigger reconnaissance and contact targeting logic."
              : "Tip: Provide a job description to generate a tailored CV and cover letter."}
          </p>
          <div className="flex gap-2">
            {retryAvailable ? (
              <button
                type="button"
                onClick={handleRetry}
                disabled={isGenerating || isRetrying}
                className="rounded-full border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 px-4 py-2 text-sm font-semibold text-orange-700 dark:text-orange-300 transition hover:border-orange-300 dark:hover:border-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900/30 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isRetrying ? "Retrying…" : "Retry last request"}
              </button>
            ) : null}
            <button
              type="submit"
              disabled={isGenerating || isRetrying}
              className="rounded-full bg-zinc-950 dark:bg-zinc-100 px-6 py-2 text-sm font-semibold text-white dark:text-zinc-900 transition hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:disabled:bg-zinc-600"
            >
              {isGenerating ? "Generating…" : hasGeneratedInSession ? "Regenerate" : "Generate Documents"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

type ModeToggleProps = {
  mode: "standard" | "cold_outreach";
  onToggle: () => void;
};

function ModeToggle({ mode, onToggle }: ModeToggleProps) {
  const isCold = mode === "cold_outreach";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isCold}
      aria-label={isCold ? "Switch to standard application mode" : "Switch to cold outreach mode"}
      className={`relative inline-flex h-12 w-28 items-center justify-between overflow-hidden rounded-full p-1 text-xs font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
        isCold
          ? "bg-gradient-to-r from-indigo-400 via-purple-500 to-violet-500 focus-visible:outline-purple-300"
          : "bg-gradient-to-r from-orange-400 via-rose-500 to-pink-500 focus-visible:outline-orange-200"
      }`}
    >
      <span className="sr-only">Toggle cold outreach workflow</span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background: "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.35), transparent 60%)",
        }}
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-white/10" />
      <div className="relative flex h-10 w-full items-center justify-between px-1">
        <span
          className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm transition duration-300 ${
            isCold ? "text-white/60" : "bg-white text-orange-500"
          }`}
        >
          <FontAwesomeIcon icon={faFire} />
        </span>
        <span
          className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm transition duration-300 ${
            isCold ? "bg-white text-sky-600" : "text-white/70"
          }`}
        >
          <FontAwesomeIcon icon={faSnowflake} />
        </span>
        <span
          aria-hidden="true"
          className={`absolute left-1 top-1 z-0 h-8 w-12 rounded-full bg-white shadow-[0_6px_15px_rgba(15,23,42,0.25)] transition-transform duration-300 ${
            isCold ? "translate-x-12" : "translate-x-0"
          }`}
        />
      </div>
    </button>
  );
}
