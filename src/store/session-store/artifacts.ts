import type { GenerationArtifacts } from "@/hooks/useStreamableValue";
import type { ClientSession } from "./types";

type ArtifactPreviews = {
  cv?: string;
  cvChangeSummary?: string;
  coverLetter?: string;
  coldEmail?: string;
  coldEmailSubject?: string;
  coldEmailBody?: string;
};

function unwrapRedacted(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("[REDACTED")) {
    return undefined;
  }
  return trimmed;
}

function extractArtifactPreviews(metadata?: Record<string, unknown>): ArtifactPreviews {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }
  const previewsRaw = (metadata as Record<string, unknown>)["artifactPreviews"];
  if (!previewsRaw || typeof previewsRaw !== "object") {
    return {};
  }
  const previewsRecord = previewsRaw as Record<string, unknown>;
  const readPreview = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const candidate = previewsRecord[key];
      if (typeof candidate !== "string") {
        continue;
      }
      const trimmed = candidate.trim();
      if (!trimmed || trimmed.startsWith("[REDACTED")) {
        continue;
      }
      return trimmed;
    }
    return undefined;
  };
  return {
    cv: readPreview("cvPreview", "cv"),
    cvChangeSummary: readPreview("cvChangeSummary"),
    coverLetter: readPreview("coverLetterPreview", "coverLetter"),
    coldEmail: readPreview("coldEmailPreview", "coldEmail"),
    coldEmailSubject: readPreview("coldEmailSubjectPreview", "coldEmailSubject"),
    coldEmailBody: readPreview("coldEmailBodyPreview", "coldEmailBody"),
  };
}

function readNumber(metadata: Record<string, unknown> | undefined, key: string): number | undefined {
  if (!metadata) {
    return undefined;
  }
  const value = metadata[key];
  return typeof value === "number" ? value : undefined;
}

function readStringArray(metadata: Record<string, unknown> | undefined, key: string): string[] | undefined {
  if (!metadata) {
    return undefined;
  }
  const value = metadata[key];
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((entry) => typeof entry === "string") as string[];
}

export function buildArtifactsFromSession(session?: ClientSession | null): GenerationArtifacts | null {
  if (!session) {
    return null;
  }
  const files = session.generatedFiles ?? {};
  const previews = extractArtifactPreviews(session.metadata);
  const cvFullLatex = unwrapRedacted(
    typeof session.metadata?.cvFullLatex === "string" ? session.metadata.cvFullLatex : undefined,
  );
  const cvGenerations = Array.isArray(session.metadata?.cvGenerations)
    ? (session.metadata?.cvGenerations as Array<Record<string, unknown>>)
    : [];
  const coverLetterGenerations = Array.isArray(session.metadata?.coverLetterGenerations)
    ? (session.metadata?.coverLetterGenerations as Array<Record<string, unknown>>)
    : [];
  const detectedEmails = readStringArray(session.metadata, "detectedEmails");
  const coldEmailSubject = typeof session.metadata?.coldEmailSubject === "string" ? session.metadata?.coldEmailSubject : undefined;
  const coldEmailBody = typeof session.metadata?.coldEmailBody === "string" ? session.metadata?.coldEmailBody : undefined;
  const coldEmailTo = typeof session.metadata?.coldEmailTo === "string" ? session.metadata?.coldEmailTo : undefined;
  const artifacts: GenerationArtifacts = {};

  // CV artifacts can exist without generatedFiles; prefer metadata-derived LaTeX and build a render URL.
  const cvVersionsUnsorted = cvGenerations
    .map((entry) => ({
      generationId: typeof entry.generationId === "string" ? entry.generationId : "",
      content: unwrapRedacted(typeof entry.content === "string" ? entry.content : "") ?? "",
      pageCount: typeof entry.pageCount === "number" ? entry.pageCount : undefined,
      status: typeof entry.status === "string" ? entry.status : undefined,
      message: typeof entry.message === "string" ? entry.message : undefined,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : undefined,
      errorLog: typeof entry.errorLog === "string" ? entry.errorLog : undefined,
      errorLineNumbers: Array.isArray(entry.errorLineNumbers)
        ? (entry.errorLineNumbers as Array<unknown>).filter((value): value is number => typeof value === "number")
        : undefined,
      errors: Array.isArray(entry.errors)
        ? (entry.errors as Array<unknown>)
            .map((value) => (value && typeof value === "object" ? (value as Record<string, unknown>) : null))
            .filter((value): value is { message: string; lineNumbers?: number[] } => {
              if (!value || typeof value.message !== "string") {
                return false;
              }
              const linesRaw = value.lineNumbers;
              if (Array.isArray(linesRaw)) {
                const allNumbers = linesRaw.every((item: unknown): item is number => typeof item === "number");
                if (!allNumbers) {
                  return false;
                }
              }
              return true;
            })
        : undefined,
    }))
    .filter((entry) => entry.generationId && (entry.content || entry.status));

  const cvVersions = cvVersionsUnsorted
    .sort((a, b) => {
      const aTime = a.createdAt ?? "";
      const bTime = b.createdAt ?? "";
      if (aTime && bTime) return aTime.localeCompare(bTime);
      if (aTime) return 1;
      if (bTime) return -1;
      return a.generationId.localeCompare(b.generationId);
    })
    .reduce((acc, entry) => {
      if (acc.has(entry.generationId)) {
        acc.delete(entry.generationId);
      }
      acc.set(entry.generationId, entry);
      return acc;
    }, new Map<string, typeof cvVersionsUnsorted[number]>());

  const cvVersionsList = Array.from(cvVersions.values());
  const latestCv = cvVersionsList[cvVersionsList.length - 1];
  const cvContent = latestCv?.content ?? cvFullLatex ?? previews.cv ?? "";
  if (cvContent || latestCv?.status) {
    const hasRenderablePdf = latestCv?.status !== "failed";
    const renderBase = hasRenderablePdf
      ? `/api/render-pdf?sessionId=${encodeURIComponent(session.id)}&artifact=cv${latestCv?.generationId ? `&generationId=${encodeURIComponent(latestCv.generationId)}` : ""}`
      : null;
    artifacts.cv = {
      content: cvContent,
      downloadUrl: hasRenderablePdf && renderBase ? `${renderBase}&disposition=attachment` : "",
      storageKey: hasRenderablePdf ? "inline-render" : "",
      mimeType: hasRenderablePdf ? "application/pdf" : "application/x-latex",
      metadata: files.cv ? { label: files.cv.label } : undefined,
      pageCount: readNumber(session.metadata, "cvPageCount") ?? latestCv?.pageCount ?? null,
      generationId: latestCv?.generationId,
      versions: cvVersionsList,
      changeSummary: previews.cvChangeSummary,
    };
  }
  if (files.coverLetter) {
    const coverLetterVersionsUnsorted = coverLetterGenerations
      .map((entry) => ({
        generationId: typeof entry.generationId === "string" ? entry.generationId : "",
        content: unwrapRedacted(typeof entry.content === "string" ? entry.content : "") ?? "",
        status: typeof entry.status === "string" ? entry.status : undefined,
        message: typeof entry.message === "string" ? entry.message : undefined,
        createdAt: typeof entry.createdAt === "string" ? entry.createdAt : undefined,
      }))
      .filter((entry) => entry.generationId && entry.content);
    const coverLetterVersions = coverLetterVersionsUnsorted
      .sort((a, b) => {
        const aTime = a.createdAt ?? "";
        const bTime = b.createdAt ?? "";
        if (aTime && bTime) return aTime.localeCompare(bTime);
        if (aTime) return 1;
        if (bTime) return -1;
        return a.generationId.localeCompare(b.generationId);
      })
      .reduce((acc, entry) => {
        if (acc.has(entry.generationId)) {
          acc.delete(entry.generationId);
        }
        acc.set(entry.generationId, entry);
        return acc;
      }, new Map<string, typeof coverLetterVersionsUnsorted[number]>());

    const coverLetterVersionsList = Array.from(coverLetterVersions.values());
    const latestCover = coverLetterVersionsList[coverLetterVersionsList.length - 1];
    artifacts.coverLetter = {
      content: latestCover?.content ?? previews.coverLetter ?? "",
      downloadUrl: files.coverLetter.url,
      storageKey: files.coverLetter.key,
      mimeType: files.coverLetter.mimeType,
      metadata: { label: files.coverLetter.label },
      generationId: latestCover?.generationId,
      versions: coverLetterVersionsList,
    };
  }
  if (files.coldEmail) {
    artifacts.coldEmail = {
      content: previews.coldEmail ?? "",
      downloadUrl: files.coldEmail.url,
      storageKey: files.coldEmail.key,
      mimeType: files.coldEmail.mimeType,
      metadata: { label: files.coldEmail.label },
      emailAddresses: detectedEmails,
      subject: previews.coldEmailSubject ?? coldEmailSubject,
      body: previews.coldEmailBody ?? coldEmailBody ?? previews.coldEmail,
      toAddress: coldEmailTo,
    };
  }

  return Object.keys(artifacts).length ? artifacts : null;
}
