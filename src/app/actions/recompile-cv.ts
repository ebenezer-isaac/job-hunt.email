"use server";

import { z } from "zod";

import { requireServerAuthTokens } from "@/lib/auth";
import { env } from "@/env";
import { sessionRepository } from "@/lib/session";
import { getStorageProvider } from "@/lib/storage/types";
import { DocumentService, LatexCompileError, type LatexLogError } from "@/lib/document-service";
import { createDebugLogger } from "@/lib/debug-logger";
import { sanitizeFirestoreMap } from "./generate/object-utils";
import { serializeSession } from "@/lib/serializers/session";

const logger = createDebugLogger("recompile-cv-action");
const storageProvider = getStorageProvider();
let documentService: DocumentService | null = null;

async function getDocumentService(): Promise<DocumentService> {
  if (!documentService) {
    documentService = new DocumentService(storageProvider);
  }
  return documentService;
}

const inputSchema = z.object({
  sessionId: z.string().min(1),
  latex: z.string().min(1).max(env.MAX_CONTENT_LENGTH),
  generationId: z.string().min(1).optional(),
});

type CvGeneration = {
  generationId: string;
  content?: string;
  pageCount?: number;
  status?: string;
  message?: string;
  createdAt?: string;
};

type RecompileCvSuccess = {
  ok: true;
  session: ReturnType<typeof serializeSession>;
  pageCount: number | null;
  downloadUrl: string;
  storageKey: string;
};

type RecompileCvFailure = {
  ok: false;
  errorMessage: string;
  errorLog?: string;
  errorLineNumbers?: number[];
  errors?: LatexLogError[];
};

export type RecompileCvResponse = RecompileCvSuccess | RecompileCvFailure;

export async function recompileCvAction(rawInput: unknown): Promise<RecompileCvResponse> {
  const { sessionId, latex, generationId } = inputSchema.parse(rawInput);
  const tokens = await requireServerAuthTokens();
  const userId = tokens.decodedToken.uid;
  if (!userId) {
    throw new Error("Authenticated user is missing uid");
  }

  logger.step("Recompile request received", { sessionId, userId, latexLength: latex.length });

  const session = await sessionRepository.getSession(sessionId);
  if (!session || session.userId !== userId) {
    throw new Error("Session not found or access denied");
  }

  const service = await getDocumentService();
  let compile;
  try {
    compile = await service.renderLatexEphemeral(latex);
  } catch (error) {
    const latexError = error instanceof LatexCompileError ? error : null;
    const message = latexError?.message ?? (error instanceof Error ? error.message : "Failed to compile LaTeX");
    logger.error("Recompile failed", {
      sessionId,
      userId,
      message,
      lineNumbers: latexError?.lineNumbers,
    });

    return {
      ok: false,
      errorMessage: message,
      errorLog: latexError?.logExcerpt,
      errorLineNumbers: latexError?.lineNumbers,
      errors: latexError?.errors,
    };
  }
  const updatedFiles = { ...session.generatedFiles };

  const existingPreviews =
    (session.metadata?.artifactPreviews as Record<string, unknown> | undefined) ?? {};
  const cvPreview = latex.length > 1000 ? `${latex.slice(0, 1000)}...` : latex;

  const existingCvGenerations = Array.isArray(session.metadata?.cvGenerations)
    ? (session.metadata.cvGenerations as Array<Record<string, unknown>>)
        .filter((entry) => Boolean(entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).generationId === "string"))
        .map((entry) => entry as CvGeneration)
    : undefined;

    const upsertGeneration = <T extends { generationId: string }>(
      existing: Array<T> | undefined,
      entry: T,
    ): Array<T> => {
      const list = Array.isArray(existing) ? [...existing] : [];
      const idx = list.findIndex((item) => item.generationId === entry.generationId);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...entry };
      } else {
        list.push(entry);
      }
      return list;
    };

  const resolvedGenerationId = generationId || (session.metadata?.lastGenerationId as string | undefined) || "latest";
  const now = new Date().toISOString();

  const metadataUpdate = sanitizeFirestoreMap({
    cvPageCount: compile.pageCount,
    cvFullLatex: latex,
    artifactPreviews: {
      ...existingPreviews,
      cvPreview,
    },
    cvGenerations: upsertGeneration(existingCvGenerations, {
      generationId: resolvedGenerationId,
      content: latex,
      pageCount: compile.pageCount ?? undefined,
      status: "success",
      createdAt: now,
    }),
  });

  const updatedSession = await sessionRepository.updateSession(
    sessionId,
    {
      generatedFiles: updatedFiles,
      metadata: metadataUpdate,
    },
    userId,
  );

  logger.step("Recompile completed", { sessionId, pageCount: compile.pageCount });

  const serialized = serializeSession(updatedSession);
  return {
    ok: true,
    session: serialized,
    pageCount: compile.pageCount,
    downloadUrl: `/api/render-pdf?sessionId=${encodeURIComponent(sessionId)}&artifact=cv${generationId ? `&generationId=${encodeURIComponent(generationId)}` : ""}&disposition=attachment`,
    storageKey: "inline-render",
  };
}
