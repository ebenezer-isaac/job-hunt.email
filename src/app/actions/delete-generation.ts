"use server";

import { requireServerAuthTokens } from "@/lib/auth";
import { sessionRepository } from "@/lib/session";
import { serializeSession } from "@/lib/serializers/session";
import { createDebugLogger } from "@/lib/debug-logger";
import { getStorageProvider } from "@/lib/storage/types";

const logger = createDebugLogger("delete-generation-action");
const storage = getStorageProvider();

export async function deleteGenerationAction(input: { sessionId: string; generationId: string; messageIds?: string[] }) {
  const tokens = await requireServerAuthTokens();
  logger.step("Deleting generation", {
    sessionId: input.sessionId,
    generationId: input.generationId,
    userId: tokens.decodedToken.uid,
  });

  let updated;
  let deletedFileKeys: string[] = [];
  try {
    const result = await sessionRepository.deleteGeneration(
      input.sessionId,
      input.generationId,
      tokens.decodedToken.uid,
      input.messageIds,
    );
    updated = result.updated;
    deletedFileKeys = result.deletedFileKeys;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found")) {
      logger.warn("Generation delete requested for missing session", { sessionId: input.sessionId, generationId: input.generationId });
      throw new Error("Session not found or already deleted");
    }
    throw error;
  }

  if (deletedFileKeys.length) {
    await Promise.allSettled(
      deletedFileKeys.map(async (key) => {
        try {
          await storage.delete(key);
        } catch (error) {
          logger.warn("Failed to delete file during generation removal", {
            key,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  }

  logger.info("Generation deleted", { sessionId: input.sessionId, generationId: input.generationId });
  return serializeSession(updated);
}
