"use server";

import { z } from "zod";

import { aiService } from "@/lib/ai/service";
import { requireServerAuthTokens } from "@/lib/auth";
import { createDebugLogger } from "@/lib/debug-logger";
import { env } from "@/env";
import { recompileCvAction, type RecompileCvResponse } from "./recompile-cv";
import type { SerializableSession } from "@/types/session";

const logger = createDebugLogger("auto-fix-cv-action");

const inputSchema = z.object({
  sessionId: z.string().min(1),
  latex: z.string().min(1).max(env.MAX_CONTENT_LENGTH),
  generationId: z.string().min(1).optional(),
  errorSummary: z.string().optional(),
  compilerLog: z.string().optional(),
});

export type AutoFixCvSuccess = {
  ok: true;
  session: SerializableSession;
  latex: string;
  pageCount: number | null;
  attempts: number;
  downloadUrl: string;
  storageKey: string;
};

export type AutoFixCvFailure = {
  ok: false;
  attempts: number;
  errorMessage: string;
  errorLog?: string;
  errorLineNumbers?: number[];
  errors?: Array<{ message: string; lineNumbers?: number[] }>;
};

export type AutoFixCvResponse = AutoFixCvSuccess | AutoFixCvFailure;

const MAX_ATTEMPTS = 3;

function buildErrorSummaryFromResponse(response: RecompileCvResponse): string {
  if (response.ok) {
    return "";
  }
  const parts: string[] = [];
  if (response.errors?.length) {
    parts.push(
      response.errors
        .map((err) => {
          const hint = err.lineNumbers?.length ? ` (lines ${err.lineNumbers.join(", ")})` : "";
          return `- ${err.message}${hint}`;
        })
        .join("\n"),
    );
  }
  if (response.errorLineNumbers?.length && !parts.length) {
    parts.push(`Line hints: ${response.errorLineNumbers.join(", ")}`);
  }
  if (response.errorMessage) {
    parts.push(response.errorMessage);
  }
  return parts.filter(Boolean).join("\n");
}

export async function autoFixCvAction(rawInput: unknown): Promise<AutoFixCvResponse> {
  const { sessionId, latex, generationId, errorSummary, compilerLog } = inputSchema.parse(rawInput);
  const tokens = await requireServerAuthTokens();
  const userId = tokens.decodedToken.uid;
  if (!userId) {
    throw new Error("Authenticated user is missing uid");
  }

  logger.step("Auto-fix request received", { sessionId, userId, hasSummary: Boolean(errorSummary), hasLog: Boolean(compilerLog) });

  let currentLatex = latex;
  let summary = errorSummary ?? "LaTeX compilation failed. Attempting auto-fix.";
  let logExcerpt = compilerLog ?? "";
  let lastFailure: RecompileCvResponse | null = null;
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    logger.step("Auto-fix attempt", { attempt });
    attemptsMade = attempt;
    const fixedLatex = await aiService.fixLatexErrorsAssist({ latexSource: currentLatex, errorSummary: summary, compilerLog: logExcerpt });

    const compileResult = await recompileCvAction({ sessionId, latex: fixedLatex, generationId });

    if (compileResult.ok) {
      logger.step("Auto-fix succeeded", { attempt, pageCount: compileResult.pageCount });
      return {
        ok: true,
        session: compileResult.session,
        latex: fixedLatex,
        pageCount: compileResult.pageCount,
        attempts: attempt,
        downloadUrl: compileResult.downloadUrl,
        storageKey: compileResult.storageKey,
      };
    }

    lastFailure = compileResult;
    summary = buildErrorSummaryFromResponse(compileResult) || summary;
    logExcerpt = compileResult.errorLog ?? logExcerpt;
    currentLatex = fixedLatex;
    logger.warn("Auto-fix attempt failed", {
      attempt,
      error: compileResult.errorMessage,
      lineNumbers: compileResult.errorLineNumbers,
    });
  }

  const attempts = attemptsMade || MAX_ATTEMPTS;
  const errorMessage = lastFailure?.ok === false ? lastFailure.errorMessage : "Unable to auto-fix LaTeX after retries.";
  return {
    ok: false,
    attempts,
    errorMessage,
    errorLog: lastFailure?.ok === false ? lastFailure.errorLog : undefined,
    errorLineNumbers: lastFailure?.ok === false ? lastFailure.errorLineNumbers : undefined,
    errors: lastFailure?.ok === false ? lastFailure.errors : undefined,
  };
}
