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

import { formSchema, normalizeFormData, type ParsedForm } from './generate/form';
import { sanitizeFirestoreMap } from './generate/object-utils';
import { createImmediateStream, createStreamController, type StreamResult } from './generate/stream';
import { runGenerationWorkflow } from './generate/workflow';

const sessionLogger = createDebugLogger('generate-session');
const requestLogger = createDebugLogger('generate-request');
const PROCESSING_TIMEOUT_MS = 45 * 60_000;

async function persistSessionSuccess(
  parsed: ParsedForm,
  userId: string,
  generatedFiles: Record<string, { key: string; url: string; label: string; mimeType?: string }>,
  parsedEmails: string[],
  coverLetter?: { content?: string; subject?: string; body?: string; toAddress?: string },
  coldEmail?: { content?: string; subject?: string; body?: string; toAddress?: string },
  cvPageCount?: number | null,
  cvChangeSummary?: string | null,
) {
  const previews = sanitizeFirestoreMap({
    coverLetter: coverLetter?.content,
    coldEmail: coldEmail?.content,
    coldEmailSubject: coldEmail?.subject,
    coldEmailBody: coldEmail?.body,
    cvChangeSummary: cvChangeSummary || undefined,
  });
  const artifactPreviews = Object.keys(previews).length ? previews : undefined;

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
  const parsedResult = formSchema.safeParse(normalizeFormData(formData));
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
          payload: { companyName: parsed.companyName, jobTitle: parsed.jobTitle },
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
        const userMessage = timedOut
          ? 'Generation timed out after 45 minutes. Please try again.'
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
