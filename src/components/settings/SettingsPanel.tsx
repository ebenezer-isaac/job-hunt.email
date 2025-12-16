'use client';

import { useState, useTransition } from "react";
import { useDebouncedCallback } from "use-debounce";
import { toast } from "sonner";
import { saveContentAction } from "@/app/actions/save-content";
import { useSessionStore, type SessionStoreState } from "@/store/session-store";

const TEXT_DOCS: Record<DocKey, { label: string; helper: string; placeholder: string }> = {
  original_cv: {
    label: "Original 2-page CV",
    helper: "Paste LaTeX (.tex) source exactly as compiled.",
    placeholder: "Paste the full LaTeX (.tex) CV here",
  },
  extensive_cv: {
    label: "Extensive CV Context",
    helper: "Provide supporting plain text or Markdown context.",
    placeholder: "Paste supporting context here",
  },
  cover_letter: {
    label: "Cover Letter Draft",
    helper: "Editable draft; auto-saves as you type.",
    placeholder: "Write or paste your cover letter draft here",
  },
};

const STRATEGY_DOCS: Record<StrategyKey, { label: string; helper: string; readOnly?: boolean }> = {
  cv_strategy: {
    label: "CV Strategy Guidance",
    helper: "Global playbook – visible for reference only.",
    readOnly: true,
  },
  cover_letter_strategy: {
    label: "Cover Letter Strategy",
    helper: "Global playbook – visible for reference only.",
    readOnly: true,
  },
  cold_email_strategy: {
    label: "Cold Email Strategy",
    helper: "Global playbook – visible for reference only.",
    readOnly: true,
  },
  recon_strategy: {
    label: "Strategic Recon Playbook",
    helper: "Global playbook – research workflow reference.",
    readOnly: true,
  },
};

type DocKey = "original_cv" | "extensive_cv" | "cover_letter";
type StrategyKey = "cv_strategy" | "cover_letter_strategy" | "cold_email_strategy" | "recon_strategy";
type SourceDocKey = DocKey | StrategyKey;
type StoreDocKey = keyof SessionStoreState["sourceDocuments"];

const STORE_KEY_MAP: Record<SourceDocKey, StoreDocKey> = {
  original_cv: "originalCV",
  extensive_cv: "extensiveCV",
  cover_letter: "coverLetter",
  cv_strategy: "cvStrategy",
  cover_letter_strategy: "coverLetterStrategy",
  cold_email_strategy: "coldEmailStrategy",
  recon_strategy: "reconStrategy",
};

type SaveState = "idle" | "saving" | "saved" | "error" | "global";

type SettingsPanelProps = {
  onClose?: () => void;
};

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const sourceDocuments = useSessionStore((state) => state.sourceDocuments);
  const { updateSourceDocument } = useSessionStore((state) => state.actions);
  const [saveState, setSaveState] = useState<Record<SourceDocKey, SaveState>>({
    original_cv: "idle",
    extensive_cv: "idle",
    cover_letter: "idle",
    cv_strategy: "global",
    cover_letter_strategy: "global",
    cold_email_strategy: "global",
    recon_strategy: "global",
  });
  const [, startTransition] = useTransition();

  const debouncedSave = useDebouncedCallback((docType: SourceDocKey, value: string) => {
    startTransition(() => {
      setSaveState((prev) => ({ ...prev, [docType]: "saving" }));
      saveContentAction({ docType, content: value })
        .then(() => {
          setSaveState((prev) => ({ ...prev, [docType]: "saved" }));
        })
        .catch((error) => {
          setSaveState((prev) => ({ ...prev, [docType]: "error" }));
          toast.error(error instanceof Error ? error.message : "Unable to save document");
        });
    });
  }, 800);

  const handleChange = (docType: SourceDocKey, value: string) => {
    const storeKey = STORE_KEY_MAP[docType];
    updateSourceDocument(storeKey, value);
    setSaveState((prev) => ({ ...prev, [docType]: "saving" }));
    debouncedSave(docType, value);
  };

  return (
    <section className="flex h-full flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-400">Source documents</p>
          <h2 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Manage your CV inputs</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Updates auto-save every few keystrokes. Paste your CV content and supporting context below.
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-300 dark:border-zinc-600 px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 transition hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ← Back to workspace
          </button>
        ) : null}
      </header>
      <div className="grid flex-1 gap-6 lg:grid-cols-2">
        {(Object.keys(TEXT_DOCS) as DocKey[]).map((docType) => (
          <DocumentEditor
            key={docType}
            label={TEXT_DOCS[docType].label}
            helper={TEXT_DOCS[docType].helper}
            value={(() => {
              switch (docType) {
                case "original_cv":
                  return sourceDocuments.originalCV;
                case "extensive_cv":
                  return sourceDocuments.extensiveCV;
                case "cover_letter":
                  return sourceDocuments.coverLetter;
                default:
                  return "";
              }
            })()}
            status={saveState[docType]}
            onChange={(value) => handleChange(docType, value)}
            onBlur={() => debouncedSave.flush?.()}
            placeholder={TEXT_DOCS[docType].placeholder}
          />
        ))}
      </div>

      <section className="mt-6 space-y-4">
        <header>
          <p className="text-xs uppercase tracking-widest text-zinc-400">Strategy playbooks</p>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Control voice & constraints</h3>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          {(Object.keys(STRATEGY_DOCS) as StrategyKey[]).map((docType) => {
            const config = STRATEGY_DOCS[docType];
            const storeKey = STORE_KEY_MAP[docType];
            const value = sourceDocuments[storeKey];
            return (
              <StrategyEditor
                key={docType}
                label={config.label}
                helper={config.helper}
                value={value}
                status={saveState[docType]}
                readOnly={config.readOnly}
              />
            );
          })}
        </div>
      </section>

      <footer className="mt-8 border-t border-zinc-200 dark:border-zinc-800 pt-6 text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          💡 <strong>Need a LaTeX CV?</strong> Use{" "}
          <a href="https://resumake.io" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300">
            Resumake.io
          </a>{" "}
          to build one online. Edit with{" "}
          <a href="https://www.overleaf.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300">
            Overleaf
          </a>.
        </p>
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
          <a href="https://github.com/ebenezer-isaac/job-hunt.email" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            View on GitHub
          </a>
        </p>
      </footer>
    </section>
  );
}

type DocumentEditorProps = {
  label: string;
  helper: string;
  value: string;
  status: SaveState;
  onChange: (next: string) => void;
  onBlur?: () => void;
  placeholder: string;
};

function DocumentEditor(props: DocumentEditorProps) {
  const { label, helper, value, status, onChange, onBlur, placeholder } = props;
  return (
    <div className="flex h-full flex-col rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{label}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{helper}</p>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="mt-4 min-h-[320px] flex-1 rounded-3xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200 focus:border-zinc-900 dark:focus:border-zinc-500 focus:bg-white dark:focus:bg-zinc-800 focus:outline-none"
        placeholder={placeholder}
      />
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Status:{" "}
        <span className={statusClassName(status)}>
          {status === "idle" && "Idle"}
          {status === "saving" && "Saving..."}
          {status === "saved" && "Saved"}
          {status === "error" && "Error saving"}
          {status === "global" && "Global template"}
        </span>
      </p>
    </div>
  );
}

function statusClassName(status: SaveState) {
  switch (status) {
    case "saved":
      return "text-emerald-600";
    case "error":
      return "text-red-600";
    case "saving":
      return "text-orange-500";
    case "global":
      return "text-zinc-500";
    default:
      return "text-zinc-500";
  }
}

type StrategyEditorProps = {
  label: string;
  helper: string;
  value: string;
  status: SaveState;
  readOnly?: boolean;
};

function StrategyEditor({ label, helper, value, status, readOnly }: StrategyEditorProps) {
  return (
    <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{label}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{helper}</p>
        </div>
      </div>
      <textarea
        value={value}
        readOnly={readOnly}
        disabled={readOnly}
        rows={6}
        className={`mt-3 w-full rounded-2xl border px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none ${
          readOnly ? 'border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400' : 'border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 focus:border-zinc-900 dark:focus:border-zinc-500 focus:bg-white dark:focus:bg-zinc-800'
        }`}
        placeholder="Global playbook"
      />
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Status: <span className={statusClassName(status)}>{statusLabel(status)}</span>
      </p>
    </div>
  );
}

function statusLabel(status: SaveState): string {
  switch (status) {
    case "global":
      return "Global template";
    case "saved":
      return "Saved";
    case "saving":
      return "Saving...";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
}
