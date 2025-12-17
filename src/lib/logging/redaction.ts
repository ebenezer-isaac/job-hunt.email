const STRICT_REDACT_KEYS = new Set([
  "jobdescription",
  "originalcv",
  "extensivecv",
  "validatedcvtext",
  "validatedcv",
  "cvtex",
  "texsource",
  "latexsource",
  "fullcv",
  "resume",
  "coverletter",
  "coverlettercontent",
  "coldemail",
  "emailbody",
  "documentcontent",
  "rawdocument",
  "rawpayload",
  "jobtext",
]);

const KEYWORD_REDACT_MATCHERS = [
  "description",
  "content",
  "profile",
  "summary",
  "payload",
  "body",
  "document",
  "resume",
  "cover",
  "letter",
  "email",
  "tex",
  "latex",
  "cv",
];

const LATEX_MARKERS = [/\\documentclass/i, /\\begin\{document\}/i, /\\section\{/i, /\\usepackage/i];
const DEFAULT_LOG_STRING_LIMIT = 512;
const DEFAULT_METADATA_STRING_LIMIT = 4000;
const FORCE_REDACTION_LENGTH = 15000;
const KEYWORD_REDACTION_LENGTH = 1200;
const MULTILINE_THRESHOLD = 80;
const LOG_ARRAY_LIMIT = 25;
const METADATA_REDACTION_ALLOWLIST = new Set([
  "cvfulllatex",
  "cvgenerations",
  "coverlettergenerations",
  "coverletter",
  "coldemail",
  "artifactpreviews",
  "cvpreview",
  "cvchangesummary",
  "coverletterpreview",
  "coldemailpreview",
  "coldemailsubjectpreview",
  "coldemailbodypreview",
]);

type InternalOptions = {
  mode: "log" | "metadata";
  maxStringLength: number;
};

type PublicOptions = {
  maxStringLength?: number;
};

export function sanitizeForLogging<T>(value: T, options?: PublicOptions): unknown {
  return sanitizeValue(value, [], {
    mode: "log",
    maxStringLength: options?.maxStringLength ?? DEFAULT_LOG_STRING_LIMIT,
  });
}

export function sanitizeForStorage<T>(value: T, options?: PublicOptions): unknown {
  return sanitizeValue(value, [], {
    mode: "metadata",
    maxStringLength: options?.maxStringLength ?? DEFAULT_METADATA_STRING_LIMIT,
  });
}

function sanitizeValue(value: unknown, path: string[], options: InternalOptions): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return sanitizeString(value, path, options);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return sanitizeArray(value, path, options);
  }
  if (value instanceof Map) {
    const entries = Array.from(value.entries()).map(([key, entryValue]) => ({ key, value: entryValue }));
    return sanitizeArray(entries, path, options);
  }
  if (value instanceof Set) {
    return sanitizeArray(Array.from(value.values()), path, options);
  }
  if (typeof value === "object") {
    return sanitizeObject(value as Record<string, unknown>, path, options);
  }
  if (typeof value === "function") {
    return `[function ${value.name || "anonymous"}]`;
  }
  return String(value);
}

function sanitizeObject(source: Record<string, unknown>, path: string[], options: InternalOptions): Record<string, unknown> {
  const entries: Array<[string, unknown]> = [];
  for (const [key, rawValue] of Object.entries(source)) {
    if (rawValue === undefined) {
      continue;
    }
    const sanitized = sanitizeValue(rawValue, [...path, key], options);
    if (sanitized !== undefined) {
      entries.push([key, sanitized]);
    }
  }
  return Object.fromEntries(entries);
}

function sanitizeArray(values: unknown[], path: string[], options: InternalOptions): unknown[] {
  if (options.mode === "log" && values.length > LOG_ARRAY_LIMIT) {
    const subset = values.slice(0, LOG_ARRAY_LIMIT).map((value, index) => sanitizeValue(value, [...path, String(index)], options));
    subset.push(`[truncated ${values.length - LOG_ARRAY_LIMIT} items]`);
    return subset;
  }
  return values.map((value, index) => sanitizeValue(value, [...path, String(index)], options));
}

function sanitizeString(value: string, path: string[], options: InternalOptions): string {
  // Metadata needs to carry the full artifact content (CV LaTeX, cover letters, cold emails).
  // Skip redaction entirely for metadata mode and only enforce the length cap to keep Firestore payloads bounded.
  if (options.mode === "metadata") {
    const limit = options.maxStringLength;
    if (value.length > limit) {
      return `${value.slice(0, limit)}... [truncated ${value.length - limit} chars]`;
    }
    return value;
  }

  const key = (path[path.length - 1] ?? "").toLowerCase();
  const skipRedaction = isMetadataRedactionAllowlisted(path, options);
  const reason = skipRedaction ? null : resolveRedactionReason(key, value);
  if (reason) {
    return buildRedactionLabel(reason, value.length, path);
  }
  const limit = options.maxStringLength;
  if (value.length > limit) {
    return `${value.slice(0, limit)}... [truncated ${value.length - limit} chars]`;
  }
  return value;
}

function resolveRedactionReason(key: string, value: string): string | null {
  const normalizedKey = key.replace(/[^a-z0-9]/g, "");
  if (STRICT_REDACT_KEYS.has(normalizedKey)) {
    return `key:${normalizedKey}`;
  }
  if (value.length >= FORCE_REDACTION_LENGTH) {
    return "length";
  }
  if (LATEX_MARKERS.some((pattern) => pattern.test(value))) {
    return "latex";
  }
  const matchesKeyword = KEYWORD_REDACT_MATCHERS.some((matcher) => normalizedKey.includes(matcher));
  if (matchesKeyword && (value.length > KEYWORD_REDACTION_LENGTH || countLines(value) > MULTILINE_THRESHOLD)) {
    const keywordLabel = normalizedKey || matcherLabel(normalizedKey);
    return `key:${keywordLabel}`;
  }
  if (!normalizedKey && countLines(value) > MULTILINE_THRESHOLD * 2) {
    return "multiline";
  }
  return null;
}

function isMetadataRedactionAllowlisted(path: string[], options: InternalOptions): boolean {
  if (options.mode !== "metadata") {
    return false;
  }
  return path.some((segment) => METADATA_REDACTION_ALLOWLIST.has(segment.toLowerCase()));
}

function matcherLabel(key: string): string {
  if (!key) {
    return "keyword";
  }
  for (const matcher of KEYWORD_REDACT_MATCHERS) {
    if (key.includes(matcher)) {
      return matcher;
    }
  }
  return "keyword";
}

function buildRedactionLabel(reason: string, length: number, path: string[]): string {
  const label = path[path.length - 1] ?? "value";
  return `[REDACTED field=${label} reason=${reason} length=${length}]`;
}

function countLines(value: string): number {
  return value.split(/\r?\n/).length;
}
