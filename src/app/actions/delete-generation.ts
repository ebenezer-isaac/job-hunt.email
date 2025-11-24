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

  const { updated, deletedFileKeys } = await sessionRepository.deleteGeneration(
    input.sessionId,
    input.generationId,
    tokens.decodedToken.uid,
    input.messageIds,
  );

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
