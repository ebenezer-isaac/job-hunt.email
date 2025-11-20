'use server';

import { requireServerAuthTokens } from "@/lib/auth";
import { sessionRepository } from "@/lib/session";
import { serializeSessions } from "@/lib/serializers/session";

export async function listSessionsAction() {
  const tokens = await requireServerAuthTokens();
  const sessions = await sessionRepository.listSessions(tokens.decodedToken.uid);
  return serializeSessions(sessions);
}
