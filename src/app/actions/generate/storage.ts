import { aiService } from "@/lib/ai/service";
import { DocumentService, type CompileResult } from "@/lib/document-service";
import { getStorageProvider } from "@/lib/storage/types";

import type { ParsedForm } from "./form";

const storageProvider = getStorageProvider();
const documentService = new DocumentService(storageProvider);

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

function buildCvFilename(parsed: ParsedForm): string {
  const company = slugify(parsed.companyName, "company");
  const role = slugify(parsed.jobTitle, "role");
  return `${company}-${role}-cv.pdf`;
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
): Promise<{ cv: string; result: CompileResult }> {
  const baseParams = {
    texSource: cv,
    storage: {
      scope: "user" as const,
      userId,
      requestId: parsed.sessionId,
      artifactName: buildCvFilename(parsed),
      artifactCategory: "cv",
    },
    maxRetries: 2,
  };

  const initial = await documentService.compileLatexToPdf(baseParams);
  if (initial.success && initial.file) {
    return { cv, result: initial };
  }

  const pageCount = extractPageCountFromMessage(initial.message);
  if (!pageCount) {
    throw new Error(initial.message ?? "Unable to compile CV to PDF");
  }

  const fixedCv = await aiService.fixCVPageCount({
    failedCV: cv,
    actualPageCount: pageCount,
    jobDescription: parsed.jobDescription,
  });

  const retry = await documentService.compileLatexToPdf({ ...baseParams, texSource: fixedCv });
  if (!retry.success || !retry.file) {
    throw new Error(retry.message ?? "Failed to produce a two-page CV PDF");
  }

  return { cv: fixedCv, result: retry };
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
  const upload = await documentService.saveTextArtifact({
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
