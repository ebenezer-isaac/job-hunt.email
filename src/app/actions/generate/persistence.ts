import { sessionRepository } from "@/lib/session";
import { sanitizeFirestoreMap } from "./object-utils";
import type { ParsedForm } from "./form";
import { buildArtifactPreviews } from "./previews";

async function persistSessionSuccess(
  parsed: ParsedForm,
  userId: string,
  generatedFiles: Record<string, { key: string; url: string; label: string; mimeType?: string }>,
  parsedEmails: string[],
  cvPreview?: string | null,
  cvFullLatex?: string | null,
  coverLetter?: { content?: string; subject?: string; body?: string; toAddress?: string },
  coldEmail?: { content?: string; subject?: string; body?: string; toAddress?: string },
  cvPageCount?: number | null,
  cvChangeSummary?: string | null,
) {
  const now = new Date().toISOString();
  const maxGenerations = 6;

  const existingSession = await sessionRepository.getSession(parsed.sessionId);
  const existingMetadata = existingSession?.metadata ?? {};
  const existingCvGenerations = existingMetadata.cvGenerations as Array<{ generationId: string } & Record<string, unknown>> | undefined;
  const existingCoverLetterGenerations = existingMetadata.coverLetterGenerations as Array<{ generationId: string } & Record<string, unknown>> | undefined;

  const upsertGeneration = <T extends { generationId: string }>(existing: Array<T> | undefined, entry: T): Array<T> => {
    const list = Array.isArray(existing) ? [...existing] : [];
    const idx = list.findIndex((item) => item.generationId === entry.generationId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...entry };
    } else {
      list.push(entry);
    }
    return list.slice(-maxGenerations);
  };

  const artifactPreviews = buildArtifactPreviews({
    cv: cvPreview,
    cvChangeSummary,
    coverLetter: coverLetter?.content ?? null,
    coldEmail: coldEmail?.content ?? coldEmail?.body ?? null,
    coldEmailSubject: coldEmail?.subject ?? null,
    coldEmailBody: coldEmail?.body ?? coldEmail?.content ?? null,
  });

  await sessionRepository.updateSession(
    parsed.sessionId,
    {
      status: "completed",
      generatedFiles,
      processingStartedAt: null,
      processingDeadline: null,
      metadata: sanitizeFirestoreMap({
        companyName: parsed.companyName,
        jobTitle: parsed.jobTitle,
        companyProfile: parsed.companyProfile,
        jobSourceUrl: parsed.jobSourceUrl || undefined,
        companyWebsite: parsed.companyWebsite || undefined,
        detectedEmails: parsedEmails,
        contactName: parsed.contactName || undefined,
        contactTitle: parsed.contactTitle || undefined,
        contactEmail: parsed.contactEmail || undefined,
        lastGeneratedAt: new Date().toISOString(),
        lastGenerationId: parsed.generationId,
        mode: parsed.mode,
        cvPageCount,
        cvFullLatex: cvFullLatex ?? undefined,
        cvGenerations: upsertGeneration(existingCvGenerations, {
          generationId: parsed.generationId,
          content: cvFullLatex ?? cvPreview ?? "",
          pageCount: cvPageCount ?? undefined,
          status: "success",
          createdAt: now,
        }),
        coverLetterGenerations: coverLetter?.content
          ? upsertGeneration(existingCoverLetterGenerations, {
              generationId: parsed.generationId,
              content: coverLetter.content,
              status: "success",
              createdAt: now,
            })
          : existingCoverLetterGenerations,
        artifactPreviews,
        coldEmailSubject: coldEmail?.subject,
        coldEmailBody: coldEmail?.body,
        coldEmailTo: coldEmail?.toAddress,
        cvChangeSummary: cvChangeSummary || undefined,
        activeHoldKey: null,
        processingHoldStartedAt: null,
      }),
    },
    userId,
  );
}

async function persistSessionFailure(sessionId: string, userId: string) {
  await sessionRepository
    .updateSession(
      sessionId,
      {
        status: "failed",
        processingStartedAt: null,
        processingDeadline: null,
        metadata: sanitizeFirestoreMap({
          activeHoldKey: null,
          processingHoldStartedAt: null,
        }),
      },
      userId,
    )
    .catch(() => undefined);
}

export const persistence = {
  persistSessionSuccess,
  persistSessionFailure,
};
