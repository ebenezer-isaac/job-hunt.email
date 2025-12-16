import { AIFailureError } from "@/lib/errors/ai-failure-error";

export function isModelOverloadedError(error: unknown): boolean {
  if (!(error instanceof AIFailureError)) {
    return false;
  }
  const lower = (value: unknown) => (typeof value === "string" ? value : value instanceof Error ? value.message : "").toLowerCase();
  const parts = [lower(error.message), lower(error.originalError)];
  return parts.some((text) => text.includes("model is overloaded") || text.includes("503 service unavailable"));
}
