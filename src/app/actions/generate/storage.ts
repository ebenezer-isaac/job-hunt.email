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
    generationId?: string;
    versions?: Array<{
      generationId: string;
      content: string;
      pageCount?: number | null;
      status?: string;
      message?: string;
      createdAt?: string;
      errorLog?: string;
      errorLineNumbers?: number[];
      errors?: Array<{ message: string; lineNumbers?: number[] }>;
    }>;
  };
  generatedFile: {
    key: string;
    url: string;
    label: string;
    mimeType?: string;
  };
};

export async function persistCvArtifact(
  cv: string,
  parsed: ParsedForm,
  _userDisplayName?: string,
): Promise<{ cv: string; result: { pageCount: number | null } }> {
  void _userDisplayName;
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
