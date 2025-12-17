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
  userDisplayName?: string | null;
  cvStatus?: "success" | "failed";
  cvMessage?: string;
  cvErrorLog?: string;
  cvErrorLineNumbers?: number[];
  cvErrors?: Array<{ message: string; lineNumbers?: number[] }>;
};

export function buildArtifactsPayload({
  parsed,
  cvPersistence,
  changeSummary,
  coverLetterArtifact,
  coldEmailArtifact,
  userDisplayName,
  cvStatus = "success",
  cvMessage,
  cvErrorLog,
  cvErrorLineNumbers,
  cvErrors,
}: BuildPayloadParams): {
  artifactsPayload: GenerationArtifacts;
  generatedFiles: Record<string, StoredArtifact["generatedFile"]>;
  cvArtifact: StoredArtifact;
} {
  const hasRenderableCv = cvStatus === "success";
  const renderBase = hasRenderableCv
    ? `/api/render-pdf?sessionId=${encodeURIComponent(parsed.sessionId)}&artifact=cv${parsed.generationId ? `&generationId=${encodeURIComponent(parsed.generationId)}` : ""}${userDisplayName ? `&candidate=${encodeURIComponent(userDisplayName)}` : ""}`
    : null;

  const cvPayload: StoredArtifact["payload"] = {
    content: cvPersistence.cv,
    downloadUrl: hasRenderableCv ? `${renderBase}&disposition=attachment` : "",
    storageKey: hasRenderableCv ? "inline-render" : "",
    mimeType: hasRenderableCv ? "application/pdf" : "application/x-latex",
    pageCount: cvPersistence.result.pageCount,
    changeSummary: changeSummary ?? undefined,
    generationId: parsed.generationId,
    metadata: {
      ...(cvMessage ? { message: cvMessage } : {}),
      ...(userDisplayName ? { candidateName: userDisplayName } : {}),
    },
    versions: [
      {
        generationId: parsed.generationId,
        content: cvPersistence.cv,
        pageCount: cvPersistence.result.pageCount,
        status: cvStatus,
        message: cvMessage,
        createdAt: new Date().toISOString(),
        errorLog: cvErrorLog,
        errorLineNumbers: cvErrorLineNumbers,
        errors: cvErrors,
      },
    ],
  } as StoredArtifact["payload"];

  const cvArtifact: StoredArtifact = {
    payload: cvPayload,
    generatedFile: {
      key: "inline-render",
      url: hasRenderableCv && renderBase ? `${renderBase}&disposition=attachment` : "",
      label: "Tailored CV (PDF)",
      mimeType: "application/pdf",
    },
  };

  const artifactsPayload: GenerationArtifacts = { cv: cvPayload };
  const generatedFiles: Record<string, StoredArtifact["generatedFile"]> = hasRenderableCv
    ? {
        cv: cvArtifact.generatedFile,
      }
    : {};

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