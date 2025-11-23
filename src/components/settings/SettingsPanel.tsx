'use client';

import { useState, useTransition } from "react";
import { useDebouncedCallback } from "use-debounce";
import { toast } from "sonner";
import { saveContentAction } from "@/app/actions/save-content";
import { useSessionStore, type SessionStoreState } from "@/store/session-store";

const TEXT_DOCS: Record<DocKey, { label: string; helper: string }> = {
  original_cv: {
    label: "Original 2-page CV",
    helper: "Paste LaTeX (.tex) source exactly as compiled.",
  },
  extensive_cv: {
    label: "Extensive CV Context",
    helper: "Provide supporting plain text or Markdown context.",
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

type DocKey = "original_cv" | "extensive_cv";
type StrategyKey = "cv_strategy" | "cover_letter_strategy" | "cold_email_strategy" | "recon_strategy";
type SourceDocKey = DocKey | StrategyKey;
type StoreDocKey = keyof SessionStoreState["sourceDocuments"];

const STORE_KEY_MAP: Record<SourceDocKey, StoreDocKey> = {
  original_cv: "originalCV",
  extensive_cv: "extensiveCV",
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

  const handleFileUpload = async (docType: DocKey, file: File | null) => {
    if (!file) {
      return;
    }
    const text = await file.text();
    handleChange(docType, text);
    toast.success(`${TEXT_DOCS[docType].label} updated from file`);
  };

  return (
    <section className="flex h-full flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-400">Source documents</p>
          <h2 className="mt-1 text-2xl font-semibold text-zinc-900">Manage your CV inputs</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Updates auto-save every few keystrokes. Upload .tex files for CVs and plain text for supporting content.
          </p>
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            💡 <strong>Need a LaTeX CV?</strong> Use{" "}
            <a href="https://resumake.io" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300">
              Resumake.io
            </a>{" "}
            to build one online. Edit with{" "}
            <a href="https://www.overleaf.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300">
              Overleaf
            </a>.
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900"
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
            value={docType === "original_cv" ? sourceDocuments.originalCV : sourceDocuments.extensiveCV}
            status={saveState[docType]}
            onChange={(value) => handleChange(docType, value)}
            onUpload={(file) => handleFileUpload(docType, file)}
            onBlur={() => debouncedSave.flush?.()}
            placeholder={docType === "original_cv" ? "Paste the full LaTeX (.tex) CV here" : "Paste supporting context here"}
            accept={docType === "original_cv" ? ".tex,.txt" : ".txt,.md,.docx"}
          />
        ))}
      </div>

      <section className="mt-6 space-y-4">
        <header>
          <p className="text-xs uppercase tracking-widest text-zinc-400">Strategy playbooks</p>
          <h3 className="text-lg font-semibold text-zinc-900">Control voice & constraints</h3>
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
    </section>
  );
}

type DocumentEditorProps = {
  label: string;
  helper: string;
  value: string;
  status: SaveState;
  onChange: (next: string) => void;
  onUpload: (file: File | null) => void;
  onBlur?: () => void;
  placeholder: string;
  accept?: string;
};

function DocumentEditor(props: DocumentEditorProps) {
  const { label, helper, value, status, onChange, onUpload, onBlur, placeholder, accept } = props;
  return (
    <div className="flex h-full flex-col rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-semibold text-zinc-900">{label}</p>
          <p className="text-xs text-zinc-500">{helper}</p>
        </div>
        <label className="cursor-pointer rounded-full border border-dashed border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400">
          Upload
          <input
            type="file"
            accept={accept ?? ".txt,.md,.docx"}
            className="hidden"
            onChange={(event) => onUpload(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="mt-4 min-h-[320px] flex-1 rounded-3xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-800 focus:border-zinc-900 focus:bg-white focus:outline-none"
        placeholder={placeholder}
      />
      <p className="mt-2 text-xs text-zinc-500">
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
    <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">{label}</p>
          <p className="text-xs text-zinc-500">{helper}</p>
        </div>
      </div>
      <textarea
        value={value}
        readOnly={readOnly}
        disabled={readOnly}
        rows={6}
        className={`mt-3 w-full rounded-2xl border px-3 py-2 text-xs text-zinc-800 focus:outline-none ${
          readOnly ? 'border-zinc-100 bg-zinc-50 text-zinc-500' : 'border-zinc-100 bg-zinc-50 focus:border-zinc-900 focus:bg-white'
        }`}
        placeholder="Global playbook"
      />
      <p className="mt-2 text-xs text-zinc-500">
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
