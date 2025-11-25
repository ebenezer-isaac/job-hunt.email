"use server";

import { requireServerAuthTokens } from "@/lib/auth";
import { sessionRepository } from "@/lib/session";
import { ChatMessageKind } from "@/types/session";

export type AppendLogParams = {
  sessionId: string;
  id: string;
  message: string;
  level: "info" | "success" | "error";
  kind: ChatMessageKind;
  payload?: Record<string, unknown>;
  clientTimestamp?: string;
};

export async function appendLogAction(params: AppendLogParams) {
  const tokens = await requireServerAuthTokens();
  const userId = tokens.decodedToken.uid;

  const payload: Record<string, unknown> = {
    kind: params.kind,
    ...(params.clientTimestamp ? { clientTimestamp: params.clientTimestamp } : {}),
    ...(params.payload ?? {}),
  };

  await sessionRepository.appendChatLog(
    params.sessionId,
    {
      id: params.id,
      level: params.level,
      message: params.message,
      payload,
    },
    userId
  );
}
