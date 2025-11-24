"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";

import { env } from "@/env";
import { scheduleChatLog, scheduleUsageLog } from "@/lib/logging/audit";
import { requireServerAuthTokens } from "@/lib/auth";
import { sessionRepository } from "@/lib/session";
import { createDebugLogger, REQUEST_ID_HEADER } from "@/lib/debug-logger";
import { registerRequestLogContext } from "@/lib/logging/request-log-registry";
import { runWithRequestIdContext } from "@/lib/logging/request-id-context";
import { quotaService, QuotaExceededError } from "@/lib/security/quota-service";
import { AIFailureError } from "@/lib/errors/ai-failure-error";

import { formSchema, normalizeFormData, type ParsedForm, FormPayloadTooLargeError } from './generate/form';
import { sanitizeFirestoreMap } from './generate/object-utils';
import { createImmediateStream, createStreamController, type StreamResult } from './generate/stream';
import { runGenerationWorkflow } from './generate/workflow';

const sessionLogger = createDebugLogger('generate-session');
const requestLogger = createDebugLogger('generate-request');
const PROCESSING_TIMEOUT_MS = 45 * 60_000;

const ARTIFACT_PREVIEW_CHAR_LIMIT = 1000;

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

function buildArtifactPreviews(params: {
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

function isModelOverloadedError(error: unknown): boolean {
  if (!(error instanceof AIFailureError)) {
    return false;
  }
  const lower = (value: unknown) => (typeof value === 'string' ? value : value instanceof Error ? value.message : '').toLowerCase();
  const parts = [lower(error.message), lower(error.originalError)];
  return parts.some((text) => text.includes('model is overloaded') || text.includes('503 service unavailable'));
}

async function persistSessionSuccess(
  parsed: ParsedForm,
  userId: string,
  generatedFiles: Record<string, { key: string; url: string; label: string; mimeType?: string }>,
  parsedEmails: string[],
  cvPreview?: string | null,
  coverLetter?: { content?: string; subject?: string; body?: string; toAddress?: string },
  coldEmail?: { content?: string; subject?: string; body?: string; toAddress?: string },
  cvPageCount?: number | null,
  cvChangeSummary?: string | null,
) {
  const artifactPreviews = buildArtifactPreviews({
    cv: cvPreview,
    cvChangeSummary,
    coverLetter: coverLetter?.content ?? null,
    coldEmail: coldEmail?.content ?? coldEmail?.body ?? null,
    coldEmailSubject: coldEmail?.subject ?? null,
    coldEmailBody: coldEmail?.body ?? coldEmail?.content ?? null,
  });

  await sessionRepository.updateSession(parsed.sessionId, {
    status: 'completed',
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
      artifactPreviews,
      coldEmailSubject: coldEmail?.subject,
      coldEmailBody: coldEmail?.body,
      coldEmailTo: coldEmail?.toAddress,
      cvChangeSummary: cvChangeSummary || undefined,
      activeHoldKey: null,
      processingHoldStartedAt: null,
    }),
  }, userId);
}

async function persistSessionFailure(sessionId: string, userId: string) {
  await sessionRepository
    .updateSession(
      sessionId,
      {
        status: 'failed',
        processingStartedAt: null,
        processingDeadline: null,
        metadata: sanitizeFirestoreMap({
          activeHoldKey: null,
          processingHoldStartedAt: null,
        }),
      },
      userId,
    )
    .catch(() => sessionLogger.warn('Failed to mark session as failed', { sessionId }));
}

type GenerateOptions = {
  requestId?: string;
};

export async function generateDocumentsAction(
  formData: FormData,
  options?: GenerateOptions,
): Promise<{ stream: StreamResult }> {
  let normalizedForm: Record<string, string>;
  try {
    normalizedForm = normalizeFormData(formData);
  } catch (error) {
    if (error instanceof FormPayloadTooLargeError) {
      const limitKb = Math.round(error.limitBytes / 1024);
      requestLogger.warn("Rejected oversized form payload", {
        actualBytes: error.actualBytes,
        limitBytes: error.limitBytes,
      });
      return {
        stream: createImmediateStream(
          `Request exceeds the maximum payload size of ${limitKb}KB. Reduce input text or split the request.`,
        ),
      };
    }
    throw error;
  }

  const parsedResult = formSchema.safeParse(normalizedForm);
  if (!parsedResult.success) {
    const message = parsedResult.error.issues.map((issue) => issue.message).join('; ');
    return { stream: createImmediateStream(`Invalid request: ${message}`) };
  }

  const parsed = parsedResult.data;
  let requestId = options?.requestId;
  let requestIdSource: "options" | "header" | "missing" = requestId ? "options" : "missing";
  if (!requestId) {
    const reqHeaders = await headers();
    const headerValue = reqHeaders.get(REQUEST_ID_HEADER) ?? undefined;
    if (headerValue) {
      requestId = headerValue;
      requestIdSource = "header";
    }
  }
  requestLogger.step("Resolved requestId for generation action", {
    requestId: requestId ?? null,
    requestIdSource,
    optionsProvided: Boolean(options?.requestId),
  });
  if (requestId) {
    requestLogger.data("registering-request-context", {
      requestId,
      companyName: parsed.companyName,
      jobTitle: parsed.jobTitle,
      sessionId: parsed.sessionId,
      mode: parsed.mode,
    });
    registerRequestLogContext(requestId, {
      companyName: parsed.companyName,
      jobTitle: parsed.jobTitle,
      sessionId: parsed.sessionId,
      mode: parsed.mode,
    });
  } else {
    requestLogger.warn("RequestId missing for generation action", {
      sessionId: parsed.sessionId,
      companyName: parsed.companyName,
      jobTitle: parsed.jobTitle,
    });
  }

  const holdIdentifier = requestId ?? randomUUID();
  const holdKey = `${parsed.sessionId}:${holdIdentifier}`;

  return runWithRequestIdContext(requestId, async () => {
    const tokens = await requireServerAuthTokens();
    const userId = tokens.decodedToken.uid;
    const processingStartedAt = new Date();
    const processingDeadline = new Date(processingStartedAt.getTime() + PROCESSING_TIMEOUT_MS);
    let holdPlaced = false;
    try {
      sessionLogger.step("Placing quota hold", { userId, sessionId: parsed.sessionId, holdKey });
      await quotaService.placeHold({
        uid: userId,
        sessionId: holdKey,
        amount: 1,
      });
      holdPlaced = true;
      await sessionRepository.updateSession(
        parsed.sessionId,
        {
          status: 'processing',
          processingStartedAt,
          processingDeadline,
          metadata: sanitizeFirestoreMap({
            activeHoldKey: holdKey,
            processingHoldStartedAt: processingStartedAt.toISOString(),
          }),
        },
        userId,
      );
    } catch (error) {
      sessionLogger.warn("Failed to place quota hold or update session", {
        error: error instanceof Error ? error.message : String(error),
        holdPlaced,
      });
      if (holdPlaced) {
        await quotaService
          .releaseHold({ uid: userId, sessionId: holdKey, refund: true })
          .catch((releaseError) =>
            sessionLogger.warn('Failed to release hold after session update error', {
              holdKey,
              error: releaseError instanceof Error ? releaseError.message : String(releaseError),
            }),
          );
      }
      if (error instanceof QuotaExceededError) {
        return {
          stream: createImmediateStream(
            `Token limit reached. Email ${env.CONTACT_EMAIL} to request more allocation.`,
          ),
        };
      }
      throw error;
    }

    const { readable, emit, close } = createStreamController();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, PROCESSING_TIMEOUT_MS);

    const executeWorkflow = async () => {
      try {
        sessionLogger.step("Starting generation workflow", { sessionId: parsed.sessionId });
        const result = await runGenerationWorkflow({ parsed, userId, emit, signal: controller.signal });
        clearTimeout(timeoutId);
        await persistSessionSuccess(
          parsed,
          userId,
          result.generatedFiles,
          result.parsedEmails,
          result.cvArtifact.payload.content ?? null,
          result.coverLetterArtifact?.payload,
          result.coldEmailArtifact?.payload,
          result.cvArtifact.payload.pageCount,
          result.cvArtifact.payload.changeSummary ?? null,
        );

        scheduleChatLog({
          sessionId: parsed.sessionId,
          userId,
          level: 'success',
          message: 'Generation completed successfully',
          payload: { companyName: parsed.companyName, jobTitle: parsed.jobTitle, generationId: parsed.generationId },
        });

        const artifactKeys = Object.values(result.generatedFiles).map((file) => file.key);
        const artifactNames = Object.keys(result.generatedFiles);
        scheduleUsageLog({
          sessionId: parsed.sessionId,
          userId,
          metadata: {
            artifacts: artifactNames,
            companyName: parsed.companyName,
            jobTitle: parsed.jobTitle,
            storageKeys: artifactKeys,
          },
        });
        await quotaService.commitHold(userId, holdKey).catch((commitError) => {
          sessionLogger.warn('Failed to commit quota hold', {
            sessionId: parsed.sessionId,
            holdKey,
            error: commitError instanceof Error ? commitError.message : String(commitError),
          });
        });
        sessionLogger.info("Generation workflow completed successfully", { sessionId: parsed.sessionId });
      } catch (error) {
        clearTimeout(timeoutId);
        const timedOut = controller.signal.aborted;
        const internalMessage = error instanceof Error ? error.message : String(error);
        const overloaded = isModelOverloadedError(error);
        const userMessage = timedOut
          ? 'Generation timed out after 45 minutes. Please try again.'
          : overloaded
            ? 'Our AI provider is temporarily overloaded. Please try again in a few minutes.'
            : `Generation failed due to an internal error. Email ${env.CONTACT_EMAIL} if it keeps happening.`;
        sessionLogger.error('Generation failed', {
          sessionId: parsed.sessionId,
          error: internalMessage,
          timedOut,
        });
        await emit(`Generation failed: ${userMessage}`);
        await persistSessionFailure(parsed.sessionId, userId);
        await quotaService.releaseHold({ uid: userId, sessionId: holdKey, refund: true }).catch((releaseError) => {
          sessionLogger.warn('Failed to release quota hold', {
            sessionId: parsed.sessionId,
            holdKey,
            error: releaseError instanceof Error ? releaseError.message : String(releaseError),
          });
        });
        scheduleChatLog({
          sessionId: parsed.sessionId,
          userId,
          level: 'error',
          message: `Generation failed: ${userMessage}`,
          payload: { generationId: parsed.generationId },
        });
      } finally {
        await close();
      }
    };

    if (requestId) {
      void runWithRequestIdContext(requestId, executeWorkflow);
    } else {
      void executeWorkflow();
    }

    return { stream: readable };
  });
}
