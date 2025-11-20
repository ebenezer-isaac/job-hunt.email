import { z } from "zod";

import { createDebugLogger } from "@/lib/debug-logger";

const logger = createDebugLogger("llama-structured");

export function parseStructuredResponse<T>(raw: string, schema: z.ZodSchema<T>, label: string): T | null {
  const payload = extractJsonPayload(raw);
  if (!payload) {
    logger.warn("structured-response-missing-json", { label });
    return null;
  }
  try {
    return schema.parse(JSON.parse(payload));
  } catch (error) {
    logger.warn("structured-response-invalid", {
      label,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function extractJsonPayload(raw: string): string | null {
  const stripped = stripCodeFences(raw);
  if (isJson(stripped)) {
    return stripped;
  }
  const search = raw.trim();
  const braceStart = search.indexOf("{");
  const braceEnd = search.lastIndexOf("}");
  const bracketStart = search.indexOf("[");
  const bracketEnd = search.lastIndexOf("]");
  const start = braceStart === -1 ? bracketStart : bracketStart === -1 ? braceStart : Math.min(braceStart, bracketStart);
  const end = Math.max(braceEnd, bracketEnd);
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  const candidate = search.slice(start, end + 1);
  return isJson(candidate) ? candidate : null;
}

function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```") ) {
    return trimmed;
  }
  const firstLineBreak = trimmed.indexOf("\n");
  const closingFence = trimmed.lastIndexOf("```");
  if (firstLineBreak === -1 || closingFence === -1 || closingFence <= firstLineBreak) {
    return trimmed;
  }
  return trimmed.slice(firstLineBreak + 1, closingFence).trim();
}

function isJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}
