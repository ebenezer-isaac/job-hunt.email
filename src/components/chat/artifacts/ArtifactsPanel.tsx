'use client';

import { useMemo } from "react";
import { faEnvelope, faFileLines, faFilePdf } from "@fortawesome/free-solid-svg-icons";
import type { GenerationArtifacts } from "@/hooks/useStreamableValue";
import { useSessionStore } from "@/store/session-store";
import { CVArtifactCard } from "./CVArtifactCard";
import { TextArtifactCard } from "./TextArtifactCard";
import { ColdEmailCard } from "./ColdEmailCard";

export type ArtifactsPanelProps = {
  artifacts: GenerationArtifacts | null;
};

export function ArtifactsPanel({ artifacts }: ArtifactsPanelProps) {
  const isSessionGenerating = useSessionStore((state) =>
    state.currentSessionId ? state.sessionGenerating[state.currentSessionId] ?? false : false,
  );

  const entries = useMemo(() => {
    if (!artifacts) {
      return [];
    }
    return [
      { label: "CV", value: artifacts.cv, icon: faFilePdf },
      { label: "Cover Letter", value: artifacts.coverLetter, icon: faFileLines },
      { label: "Cold Email", value: artifacts.coldEmail, icon: faEnvelope },
    ].filter((entry) => Boolean(entry.value));
  }, [artifacts]);

  if (!artifacts || entries.length === 0) {
    return null;
  }

  return (
    <section className="mt-6 space-y-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Generated Artifacts</p>
      {entries.map((entry) => {
        if (entry.label === "CV" && entry.value) {
          return (
            <CVArtifactCard
              key={entry.label}
              label={entry.label}
              icon={entry.icon}
              payload={entry.value}
              isSessionGenerating={isSessionGenerating}
            />
          );
        }
        if (entry.label === "Cover Letter" && entry.value) {
          return (
            <TextArtifactCard
              key={entry.label}
              label={entry.label}
              icon={entry.icon}
              payload={entry.value}
              isSessionGenerating={isSessionGenerating}
            />
          );
        }
        if (entry.label === "Cold Email" && entry.value) {
          return <ColdEmailCard key={entry.label} icon={entry.icon} payload={entry.value} />;
        }
        return null;
      })}
    </section>
  );
}
