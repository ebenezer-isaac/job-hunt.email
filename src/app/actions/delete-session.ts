"use server";

import { requireServerAuthTokens } from "@/lib/auth";
import { sessionRepository } from "@/lib/session";
import { createDebugLogger } from "@/lib/debug-logger";
import { getStorageProvider } from "@/lib/storage/types";

const logger = createDebugLogger("delete-session-action");
const storage = getStorageProvider();

export async function deleteSessionAction(sessionId: string) {
  const tokens = await requireServerAuthTokens();
  logger.step("Deleting session", { sessionId, userId: tokens.decodedToken.uid });
  const { deletedFileKeys } = await sessionRepository.deleteSession(sessionId, tokens.decodedToken.uid);
  if (deletedFileKeys.length) {
    await Promise.allSettled(
      deletedFileKeys.map(async (key) => {
        try {
          await storage.delete(key);
        } catch (error) {
          logger.warn("Failed to delete file during session removal", {
            key,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  }
  logger.info("Session deleted", { sessionId });
  return { sessionId };
}
