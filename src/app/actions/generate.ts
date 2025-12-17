"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";

import { env } from "@/env";
import { scheduleChatLog, scheduleUsageLog } from "@/lib/logging/audit";
import { requireServerAuthTokens } from "@/lib/auth";
import { createDebugLogger, REQUEST_ID_HEADER } from "@/lib/debug-logger";
import { registerRequestLogContext } from "@/lib/logging/request-log-registry";
import { runWithRequestIdContext } from "@/lib/logging/request-id-context";
import { quotaService, QuotaExceededError } from "@/lib/security/quota-service";
import { sessionRepository } from "@/lib/session";

import { formSchema, normalizeFormData, FormPayloadTooLargeError } from "./generate/form";
import { createImmediateStream, createStreamController, type StreamResult } from "./generate/stream";
import { RequestAbortedError, runGenerationWorkflow } from "./generate/workflow";
import { PROCESSING_TIMEOUT_MS } from "./generate/constants";
import { persistence } from "./generate/persistence";
import { isModelOverloadedError } from "./generate/errors";
import { sanitizeFirestoreMap } from "./generate/object-utils";
import { appendGenerationLog, finalizeGenerationLog, startGenerationLog } from "@/lib/logging/generation-logs";

const sessionLogger = createDebugLogger('generate-session');
const requestLogger = createDebugLogger('generate-request');
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
    let userId = "";
    let holdPlaced = false;
    let holdReleased = false;
    try {
      const tokens = await requireServerAuthTokens();
      const decodedToken = tokens.decodedToken as Record<string, unknown> & { uid?: string; name?: string; displayName?: string };
      userId = decodedToken.uid ?? "";
      if (!userId) {
        throw new Error("Authenticated user is missing uid");
      }
      const userDisplayName =
        (typeof decodedToken.name === "string" && decodedToken.name.trim().length ? decodedToken.name : null) ??
        (typeof decodedToken.displayName === "string" && decodedToken.displayName.trim().length ? decodedToken.displayName : null);
      const processingStartedAt = new Date();
      const processingDeadline = new Date(processingStartedAt.getTime() + PROCESSING_TIMEOUT_MS);
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
          holdReleased = true;
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
          await startGenerationLog(parsed.sessionId, userId, parsed.generationId);
          void appendGenerationLog(parsed.sessionId, userId, parsed.generationId, {
            content: 'Queued generation request. Preparing context and enforcing quota.',
            level: 'info',
          });
          const result = await runGenerationWorkflow({
            parsed,
            userId,
            userDisplayName,
            emit,
            signal: controller.signal,
            log: ({ content, level }) => {
              void appendGenerationLog(parsed.sessionId, userId, parsed.generationId, { content, level });
            },
          });
          clearTimeout(timeoutId);
          void appendGenerationLog(parsed.sessionId, userId, parsed.generationId, {
            content: 'Artifacts saved. Finalizing session metadata...',
            level: 'info',
          });
          const latestVersion = result.cvArtifact.payload.versions?.[0];
          await persistence.persistSessionSuccess(
            parsed,
            userId,
            result.generatedFiles,
            result.parsedEmails,
            result.cvArtifact.payload.content ?? null,
            result.cvArtifact.payload.content ?? null,
            result.coverLetterArtifact?.payload,
            result.coldEmailArtifact?.payload,
            result.cvArtifact.payload.pageCount,
            result.cvArtifact.payload.changeSummary ?? null,
            latestVersion?.status === "failed" ? "failed" : "success",
            latestVersion?.message ?? null,
            latestVersion?.errorLog ?? null,
            latestVersion?.errorLineNumbers ?? null,
            latestVersion?.errors ?? null,
          );

          scheduleChatLog({
            sessionId: parsed.sessionId,
            userId,
            level: 'success',
            message: 'Generation completed successfully',
            payload: { companyName: parsed.companyName, jobTitle: parsed.jobTitle, generationId: parsed.generationId },
          });
          await appendGenerationLog(parsed.sessionId, userId, parsed.generationId, {
            content: 'Generation sequence completed successfully. Finalizing artifacts.',
            level: 'success',
          });
          await finalizeGenerationLog(parsed.sessionId, userId, parsed.generationId, "completed", "Generation completed successfully");

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
          const aborted = error instanceof RequestAbortedError || (error instanceof Error && error.name === 'ResponseAborted');
          const timedOut = controller.signal.aborted;
          const internalMessage = error instanceof Error ? error.message : String(error);
          const internalName = error instanceof Error ? error.name : typeof error;
          const overloaded = isModelOverloadedError(error);
          const userMessage = aborted
            ? 'Generation cancelled because the request was closed.'
            : timedOut
              ? 'Generation timed out after 45 minutes. Please try again.'
              : overloaded
                ? 'Our AI provider is temporarily overloaded. Please try again in a few minutes.'
                : `Generation failed due to an internal error. Email ${env.CONTACT_EMAIL} if it keeps happening.`;

          if (overloaded) {
            void appendGenerationLog(parsed.sessionId, userId, parsed.generationId, {
              content: 'Model overload detected from provider. Pausing and advising user to retry.',
              level: 'warning',
            }).catch((logError) => sessionLogger.warn('Failed to append overload warning log', { error: String(logError) }));
          }

          void appendGenerationLog(parsed.sessionId, userId, parsed.generationId, {
            content: timedOut
              ? 'Generation timed out. Cleaning up resources.'
              : aborted
                ? 'Generation cancelled by client. Cleaning up resources.'
                : `Generation failed: ${internalMessage}`,
            level: timedOut || aborted ? 'warning' : 'error',
          }).catch((logError) => sessionLogger.warn('Failed to append failure log', { error: String(logError) }));

          try {
            await finalizeGenerationLog(parsed.sessionId, userId, parsed.generationId, "failed", internalMessage);
          } catch (logError) {
            sessionLogger.warn("Failed to finalize generation log", { sessionId: parsed.sessionId, error: String(logError) });
          }

          const logMethod = aborted ? sessionLogger.info.bind(sessionLogger) : sessionLogger.error.bind(sessionLogger);
          logMethod(aborted ? 'Generation aborted' : 'Generation failed', {
            sessionId: parsed.sessionId,
            error: internalMessage,
            errorName: internalName,
            timedOut,
          });

          await emit(userMessage);
          await persistence.persistSessionFailure(parsed.sessionId, userId, {
            generationId: parsed.generationId,
            message: internalMessage,
          });
          await quotaService.releaseHold({ uid: userId, sessionId: holdKey, refund: true }).catch((releaseError) => {
            sessionLogger.warn('Failed to release quota hold', {
              sessionId: parsed.sessionId,
              holdKey,
              error: releaseError instanceof Error ? releaseError.message : String(releaseError),
            });
          });
          holdReleased = true;
          scheduleChatLog({
            sessionId: parsed.sessionId,
            userId,
            level: aborted ? 'info' : 'error',
            message: aborted ? 'Generation cancelled by client' : `Generation failed: ${userMessage}`,
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
    } catch (error) {
      const internalMessage = error instanceof Error ? error.message : String(error);
      requestLogger.error("Generation start failed", {
        requestId: requestId ?? null,
        sessionId: parsed.sessionId,
        error: internalMessage,
      });

      if (holdPlaced && !holdReleased && userId) {
        await quotaService.releaseHold({ uid: userId, sessionId: holdKey, refund: true }).catch((releaseError) => {
          sessionLogger.warn('Failed to release hold after start failure', {
            sessionId: parsed.sessionId,
            holdKey,
            error: releaseError instanceof Error ? releaseError.message : String(releaseError),
          });
        });
      }

      if (userId) {
        await persistence.persistSessionFailure(parsed.sessionId, userId, {
          generationId: parsed.generationId,
          message: internalMessage,
        });
        scheduleChatLog({
          sessionId: parsed.sessionId,
          userId,
          level: 'error',
          message: `Generation failed: ${internalMessage}`,
          payload: { generationId: parsed.generationId },
        });
      }

      const userMessage = isModelOverloadedError(error)
        ? 'Our AI provider is temporarily overloaded. Please try again in a few minutes.'
        : internalMessage || 'Unable to start generation. Please try again.';

      return { stream: createImmediateStream(userMessage) };
    }
  });
}
