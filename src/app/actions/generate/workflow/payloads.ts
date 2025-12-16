import type { GenerationArtifacts } from "@/hooks/useStreamableValue";

import type { ParsedForm } from "../form";
import type { StoredArtifact } from "../storage";
import type { CvPersistence } from "./cv";

type BuildPayloadParams = {
  parsed: ParsedForm;
  cvPersistence: CvPersistence;
  changeSummary: string | null;
  coverLetterArtifact: StoredArtifact | null;
  coldEmailArtifact: StoredArtifact | null;
};

export function buildArtifactsPayload({
  parsed,
  cvPersistence,
  changeSummary,
  coverLetterArtifact,
  coldEmailArtifact,
}: BuildPayloadParams): {
  artifactsPayload: GenerationArtifacts;
  generatedFiles: Record<string, StoredArtifact["generatedFile"]>;
  cvArtifact: StoredArtifact;
} {
  const renderBase = `/api/render-pdf?sessionId=${encodeURIComponent(parsed.sessionId)}&artifact=cv${parsed.generationId ? `&generationId=${encodeURIComponent(parsed.generationId)}` : ""}`;

  const cvArtifact: StoredArtifact = {
    payload: {
      content: cvPersistence.cv,
      downloadUrl: `${renderBase}&disposition=attachment`,
      storageKey: "inline-render",
      mimeType: "application/pdf",
      pageCount: cvPersistence.result.pageCount,
      changeSummary: changeSummary ?? undefined,
      generationId: parsed.generationId,
    },
    generatedFile: {
      key: "inline-render",
      url: `${renderBase}&disposition=attachment`,
      label: "Tailored CV (PDF)",
      mimeType: "application/pdf",
    },
  };

  const artifactsPayload: GenerationArtifacts = { cv: cvArtifact.payload };
  const generatedFiles: Record<string, StoredArtifact["generatedFile"]> = { cv: cvArtifact.generatedFile };

  if (coverLetterArtifact) {
    artifactsPayload.coverLetter = {
      ...coverLetterArtifact.payload,
      generationId: parsed.generationId,
    };
    generatedFiles.coverLetter = coverLetterArtifact.generatedFile;
  }

  if (coldEmailArtifact) {
    artifactsPayload.coldEmail = {
      ...coldEmailArtifact.payload,
      generationId: parsed.generationId,
    };
    generatedFiles.coldEmail = coldEmailArtifact.generatedFile;
  }

  return { artifactsPayload, generatedFiles, cvArtifact };
}