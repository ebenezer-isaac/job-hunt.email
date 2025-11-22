import "server-only";

import * as React from "react";
import { createDebugLogger } from "@/lib/debug-logger";
import { sessionRepository } from "@/lib/session";

type AfterFn = (callback: () => void | Promise<void>) => void;

const after: AfterFn =
  ((React as unknown as { experimental_after?: AfterFn; unstable_after?: AfterFn }).experimental_after ??
    (React as unknown as { experimental_after?: AfterFn; unstable_after?: AfterFn }).unstable_after ??
    ((callback) => {
      void callback();
    }));

const auditLogger = createDebugLogger("audit-logger");

type ChatLogLevel = "info" | "success" | "error";

type ScheduleChatLogInput = {
  sessionId: string;
  id?: string;
  message: string;
  level?: ChatLogLevel;
  payload?: Record<string, unknown>;
  userId: string;
};

type UsageMetadata = {
  sessionId: string;
  metadata: Record<string, unknown>;
  userId: string;
};

export function scheduleChatLog(input: ScheduleChatLogInput): void {
  after(async () => {
    try {
      await sessionRepository.appendChatLog(input.sessionId, {
        id: input.id,
        level: input.level ?? "info",
        message: input.message,
        payload: input.payload,
      }, input.userId);
      auditLogger.step("Chat log appended", { sessionId: input.sessionId, level: input.level ?? "info" });
    } catch (error) {
      auditLogger.error("Failed to append chat log", {
        sessionId: input.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export function scheduleUsageLog(input: UsageMetadata): void {
  after(async () => {
    try {
      await sessionRepository.updateSession(
        input.sessionId,
        {
          metadata: input.metadata,
        },
        input.userId,
      );
      auditLogger.step("Usage metadata updated", { sessionId: input.sessionId });
    } catch (error) {
      auditLogger.error("Failed to update usage metadata", {
        sessionId: input.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
