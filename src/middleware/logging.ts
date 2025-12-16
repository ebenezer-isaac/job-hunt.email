import { LOG_ENDPOINT_PATH, REQUEST_ID_HEADER, type DebugLogger } from "@/lib/debug-logger";
import type { LogLevel } from "@/lib/logging/types";
import { INTERNAL_TOKEN_HEADER } from "@/lib/security/internal-token";

export async function persistEdgeLogEntry(
  level: LogLevel,
  message: string,
  data: Record<string, unknown> | null,
  requestId: string,
  serverOrigin: string,
  internalToken: string | null | undefined,
  logger: DebugLogger,
): Promise<void> {
  if (!internalToken) {
    logger.warn("Skipping Firestore log persistence: missing internal token", { message, level });
    return;
  }
  try {
    const endpoint = new URL(LOG_ENDPOINT_PATH, serverOrigin);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [REQUEST_ID_HEADER]: requestId,
        [INTERNAL_TOKEN_HEADER]: internalToken,
      },
      body: JSON.stringify({
        entry: {
          timestamp: new Date().toISOString(),
          scope: "middleware",
          level,
          message,
          data: data ?? undefined,
          requestId,
        },
      }),
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => null);
      logger.error("Failed to persist middleware log entry via API", {
        message,
        level,
        status: response.status,
        bodySnippet: errorBody ? errorBody.slice(0, 256) : null,
      });
    }
  } catch (error) {
    logger.error("Middleware log persistence threw", {
      message,
      level,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
