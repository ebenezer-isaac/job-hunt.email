import { randomUUID } from "node:crypto";

const SEGMENT_REGEX = /[^a-z0-9_-]/gi;
const FILENAME_REGEX = /[^a-z0-9._-]/gi;

function sanitizeSegment(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim().toLowerCase() ?? "";
  const sanitized = trimmed.replace(SEGMENT_REGEX, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return sanitized || fallback;
}

function sanitizeFilename(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return fallback;
  }
  const normalized = trimmed.replace(/[\\/]/g, "-");
  const sanitized = normalized.replace(FILENAME_REGEX, "-").replace(/-+/g, "-");
  return sanitized || fallback;
}

export type UserRequestPathInput = {
  userId: string;
  requestId: string;
  artifactName: string;
  artifactCategory?: string;
  rootPrefix?: string;
};

export function buildUserRequestStorageKey(input: UserRequestPathInput): string {
  const {
    userId,
    requestId,
    artifactName,
    artifactCategory,
    rootPrefix = "users",
  } = input;

  const segments = [
    sanitizeSegment(rootPrefix, "users"),
    sanitizeSegment(userId, "anonymous"),
    sanitizeSegment(requestId, randomUUID()),
  ];

  if (artifactCategory) {
    segments.push(sanitizeSegment(artifactCategory, "artifacts"));
  }

  const fileName = sanitizeFilename(artifactName, "artifact.bin");
  segments.push(fileName);

  return segments.join("/");
}

export function buildSmokeTestStorageKey(timestamp: string): string {
  const safeTimestamp = sanitizeSegment(timestamp.replace(/[:.]/g, "-"), new Date().toISOString());
  return `tests/smoke/${safeTimestamp}.pdf`;
}
