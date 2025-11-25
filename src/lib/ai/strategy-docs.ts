import "server-only";

import { createDebugLogger } from "@/lib/debug-logger";

const logger = createDebugLogger("strategy-truncation");
const STRATEGY_CONTEXT_LIMIT = 6000;

export function clampStrategyForContext(label: string, content: string | null | undefined): string {
  const normalized = content?.trim() ?? "";
  if (normalized.length <= STRATEGY_CONTEXT_LIMIT) {
    return normalized;
  }

  const truncated = `${normalized.slice(0, STRATEGY_CONTEXT_LIMIT)}\n\n[Truncated ${normalized.length - STRATEGY_CONTEXT_LIMIT} characters to fit context window]`;
  logger.warn("Strategy document truncated", {
    label,
    originalLength: normalized.length,
    limit: STRATEGY_CONTEXT_LIMIT,
  });
  return truncated;
}
