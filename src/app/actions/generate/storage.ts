import { env } from "@/env";
import { aiService } from "@/lib/ai/service";
import type { DocumentService } from "@/lib/document-service";
import { getStorageProvider } from "@/lib/storage/types";

import type { ParsedForm } from "./form";

// Note: storage is still required for non-CV artifacts, but CV no longer uploads PDFs.
const storageProvider = getStorageProvider();
let _documentService: DocumentService | null = null;

async function getDocumentService() {
  if (!_documentService) {
    const { DocumentService } = await import("@/lib/document-service");
    _documentService = new DocumentService(storageProvider);
  }
  return _documentService;
}

export type StoredArtifact = {
  payload: {
    content: string;
    downloadUrl: string;
    storageKey: string;
    mimeType: string;
    metadata?: Record<string, unknown>;
    pageCount?: number | null;
    emailAddresses?: string[];
    subject?: string;
    body?: string;
    toAddress?: string;
    changeSummary?: string;
  };
  generatedFile: {
    key: string;
    url: string;
    label: string;
    mimeType?: string;
  };
};

function slugify(value: string, fallback: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return fallback;
  }
  const sanitized = trimmed.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return sanitized || fallback;
}

function buildCvFilename(parsed: ParsedForm, userDisplayName?: string | null): string {
  const company = slugify(parsed.companyName, "company");
  const role = slugify(parsed.jobTitle, "role");
  const candidate = userDisplayName ? slugify(userDisplayName, "") : "";
  const namePrefix = candidate ? `${candidate}-` : "";
  return `${namePrefix}${company}-${role}-cv.pdf`;
}

function extractPageCountFromMessage(message?: string): number | null {
  if (!message) {
    return null;
  }
  const match = message.match(/PDF has (\d+) page/);
  return match ? Number(match[1]) : null;
}

export async function persistCvArtifact(
  cv: string,
  parsed: ParsedForm,
  userId: string,
  userDisplayName?: string | null,
): Promise<{ cv: string; result: { pageCount: number | null } }> {
  const svc = await getDocumentService();
  const targetPageCount = env.TARGET_PAGE_COUNT;

  // First pass: render without uploading to validate page count.
  const initial = await svc.renderLatexEphemeral(cv);
  if (initial.pageCount === targetPageCount) {
    return { cv, result: { pageCount: initial.pageCount } };
  }

  // Attempt to fix page count if off-target.
  const fixedCv = await aiService.fixCVPageCount({
    failedCV: cv,
    actualPageCount: initial.pageCount ?? undefined,
    jobDescription: parsed.jobDescription,
  });

  const retry = await svc.renderLatexEphemeral(fixedCv);
  if (retry.pageCount !== targetPageCount) {
    throw new Error("Failed to produce a two-page CV PDF");
  }

  return { cv: fixedCv, result: { pageCount: retry.pageCount } };
}

export async function saveTextArtifact(
  content: string,
  parsed: ParsedForm,
  userId: string,
  artifactName: string,
  artifactCategory: string,
  label: string,
  contentType: string = "text/plain",
): Promise<StoredArtifact> {
  const svc = await getDocumentService();
  const upload = await svc.saveTextArtifact({
    content,
    storage: {
      scope: "user",
      userId,
      requestId: parsed.sessionId,
      artifactName,
      artifactCategory,
    },
    contentType,
    metadata: { sessionId: parsed.sessionId, companyName: parsed.companyName },
  });

  return {
    payload: {
      content,
      downloadUrl: upload.url,
      storageKey: upload.key,
      mimeType: contentType,
    },
    generatedFile: {
      key: upload.key,
      url: upload.url,
      label,
      mimeType: contentType,
    },
  };
}
