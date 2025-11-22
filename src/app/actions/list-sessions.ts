'use server';

import { requireServerAuthTokens } from "@/lib/auth";
import { sessionRepository } from "@/lib/session";
import { serializeSessions } from "@/lib/serializers/session";
import { createDebugLogger } from "@/lib/debug-logger";

const logger = createDebugLogger("list-sessions-action");

export async function listSessionsAction() {
  const tokens = await requireServerAuthTokens();
  logger.step("Listing sessions", { userId: tokens.decodedToken.uid });
  const sessions = await sessionRepository.listSessions(tokens.decodedToken.uid);
  logger.info("Sessions retrieved", { count: sessions.length, userId: tokens.decodedToken.uid });
  return serializeSessions(sessions);
}
