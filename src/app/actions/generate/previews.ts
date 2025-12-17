import { sanitizeFirestoreMap } from "./object-utils";
import { ARTIFACT_PREVIEW_CHAR_LIMIT } from "./constants";

function normalizePreview(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > ARTIFACT_PREVIEW_CHAR_LIMIT) {
    return `${trimmed.slice(0, ARTIFACT_PREVIEW_CHAR_LIMIT)}…`;
  }
  return trimmed;
}

export function buildArtifactPreviews(params: {
  cv?: string | null;
  cvChangeSummary?: string | null;
  coverLetter?: string | null;
  coldEmail?: string | null;
  coldEmailSubject?: string | null;
  coldEmailBody?: string | null;
}) {
  const previews = sanitizeFirestoreMap({
    cvPreview: normalizePreview(params.cv),
    cvChangeSummary: normalizePreview(params.cvChangeSummary),
    coverLetterPreview: normalizePreview(params.coverLetter),
    coldEmailPreview: normalizePreview(params.coldEmail),
    coldEmailSubjectPreview: normalizePreview(params.coldEmailSubject),
    coldEmailBodyPreview: normalizePreview(params.coldEmailBody),
  });
  return Object.keys(previews).length ? previews : undefined;
}
