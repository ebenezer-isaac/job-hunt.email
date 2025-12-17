import { aiService } from "@/lib/ai/service";
import { normalizeLatexSource } from "@/lib/latex-normalizer";
import type { ResearchBrief } from "@/lib/ai/llama/context-engine";
import { LatexCompileError, type LatexLogError } from "@/lib/document-service";

import type { ParsedForm } from "../form";
import { persistCvArtifact } from "../storage";
import { assertNotAborted, describeCvCompilationError } from "./errors";
import type { ActionLogger, EmitFn, ModelRetryNotifier } from "./types";

export type CvPersistence = Awaited<ReturnType<typeof persistCvArtifact>>;

type CvGenerationParams = {
  parsed: ParsedForm;
  userDisplayName?: string | null;
  researchBrief: ResearchBrief | null;
  emit: EmitFn;
  signal?: AbortSignal;
  modelRetryNotifier: ModelRetryNotifier;
  logger: ActionLogger;
};

export async function generateCvAndSummary({
  parsed,
  userDisplayName,
  researchBrief,
  emit,
  signal,
  modelRetryNotifier,
  logger,
}: CvGenerationParams): Promise<{
  cvPersistence: CvPersistence;
  changeSummary: string | null;
  status: "success" | "failed";
  message?: string;
  errorLog?: string;
  errorLineNumbers?: number[];
  errors?: LatexLogError[];
}> {
  assertNotAborted(signal);
  const cvResponse = await aiService.generateCVAdvanced({
    jobDescription: parsed.jobDescription,
    originalCV: parsed.originalCV,
    extensiveCV: parsed.extensiveCV,
    cvStrategy: parsed.cvStrategy,
    companyName: parsed.companyName,
    jobTitle: parsed.jobTitle,
    researchBrief: researchBrief ?? undefined,
    userDisplayName: userDisplayName ?? undefined,
  }, { onRetry: modelRetryNotifier });

  const { output: normalizedCv, changes: latexNormalizationChanges } = normalizeLatexSource(cvResponse);
  if (latexNormalizationChanges.length) {
    logger.data("latex-normalization-applied", {
      sessionId: parsed.sessionId,
      rules: latexNormalizationChanges,
    });
  }

  let cvPersistence: CvPersistence;
  try {
    cvPersistence = await persistCvArtifact(normalizedCv, parsed, userDisplayName ?? undefined);
    await emit("CV PDF compiled successfully.");
  } catch (compileError) {
    const message = describeCvCompilationError(compileError);
    const latexError = compileError instanceof LatexCompileError ? compileError : null;
    await emit(message);
    logger.warn("CV compilation failed", { sessionId: parsed.sessionId, error: message });
    return {
      cvPersistence: { cv: normalizedCv, result: { pageCount: null } },
      changeSummary: null,
      status: "failed",
      message,
      errorLog: latexError?.logExcerpt,
      errorLineNumbers: latexError?.lineNumbers,
      errors: latexError?.errors,
    };
  }

  let changeSummary: string | null = null;
  try {
    assertNotAborted(signal);
    await emit("Comparing tailored CV against your original resume...");
    changeSummary = await aiService.generateCVChangeSummary(parsed.originalCV, cvPersistence.cv, { onRetry: modelRetryNotifier });
    await emit("CV change summary ready.");
  } catch (summaryError) {
    const reason = summaryError instanceof Error ? summaryError.message : String(summaryError);
    logger.warn("Failed to generate CV change summary", { sessionId: parsed.sessionId, error: reason });
    await emit(`Change summary unavailable: ${reason}`);
  }

  return { cvPersistence, changeSummary, status: "success" };
}