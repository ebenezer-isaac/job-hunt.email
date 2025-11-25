import { z } from "zod";

const BASE64_REGEX = /^[A-Za-z0-9+/=]+$/;

const aesGcmKeySchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
},
z
  .string()
  .superRefine((value, ctx) => {
    if (!BASE64_REGEX.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY must be base64-encoded" });
      return;
    }
    try {
      const bytes = Buffer.from(value, "base64");
      if (bytes.byteLength !== 32) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY must decode to exactly 32 bytes" });
      }
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is not valid base64" });
    }
  })
  .optional());

const booleanFromEnv = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      if (value.toLowerCase() === "true") {
        return true;
      }
      if (value.toLowerCase() === "false") {
        return false;
      }
    }
    if (value === undefined || value === null) {
      return defaultValue;
    }
    return value;
  }, z.boolean());

const signatureKeysSchema = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean),
  )
  .refine((keys) => keys.length > 0, {
    message: "Provide at least one cookie signature key",
  })
  .refine((keys) => keys.every((key) => key.length >= 32), {
    message: "Cookie signature keys must be at least 32 characters",
  });

const stripInvisibleBoundary = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }
  return value.replace(/\uFEFF/g, "").trim();
};

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("debug"),
  LOG_REQUEST_DEBUG: booleanFromEnv(true),
  PORT: z.coerce.number().int().positive().default(3000),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  APOLLO_API_KEY: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? ""),
  GEMINI_PRO_MODEL: z.string().default("gemini-3-pro-preview"),
  GEMINI_PRO_FALLBACK_MODEL: z.string().default("gemini-2.5-pro"),
  GEMINI_FLASH_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_EMBED_MODEL: z.string().default("text-embedding-004"),
  AI_MAX_RETRIES: z.coerce.number().int().min(1).default(5),
  AI_INITIAL_RETRY_DELAY: z.coerce.number().int().min(1000).default(10000),
  TARGET_PAGE_COUNT: z.coerce.number().int().min(1).default(2),
  MAX_CONTENT_LENGTH: z.coerce.number().int().min(1).default(50000),
  SCRAPING_TIMEOUT: z.coerce.number().int().min(1000).default(30000),
  LLAMAINDEX_ENABLE_PERSISTENCE: booleanFromEnv(true),
  LLAMAINDEX_PERSIST_DIR: z.string().default(".llamaindex-cache"),
  LLAMAINDEX_CACHE_TTL_MS: z.coerce.number().int().min(1000).default(5 * 60 * 1000),
  LLAMAINDEX_CACHE_MAX_ENTRIES: z.coerce.number().int().min(1).default(128),
  LLAMAINDEX_TRACING_ENABLED: booleanFromEnv(false),
  USER_NAME: z.string().default("ebenezer-isaac"),
  PDFLATEX_COMMAND: z.string().default("pdflatex"),
  SMOKE_TEST_ALLOWED_EMAILS: z.string().default(""),
  FIREBASE_PROJECT_ID: z.preprocess(
    stripInvisibleBoundary,
    z.string().min(1, "FIREBASE_PROJECT_ID is required"),
  ),
  FIREBASE_CLIENT_EMAIL: z.string().email("Provide a valid FIREBASE_CLIENT_EMAIL"),
  FIREBASE_PRIVATE_KEY: z.string().min(1, "FIREBASE_PRIVATE_KEY is required"),
  FIREBASE_API_KEY: z.string().min(1, "FIREBASE_API_KEY is required"),
  FIREBASE_AUTH_DEBUG: booleanFromEnv(false),
  FIREBASE_STORAGE_BUCKET: z.string().min(1, "FIREBASE_STORAGE_BUCKET is required"),
  FIREBASE_AUTH_COOKIE_NAME: z.string().min(1).default("cv-customiser-auth"),
  FIREBASE_AUTH_COOKIE_SIGNATURE_KEYS: signatureKeysSchema,
  FIREBASE_AUTH_COOKIE_MAX_AGE_SECONDS: z
    .coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 4),
  FIREBASE_AUTH_COOKIE_SECURE: booleanFromEnv(process.env.NODE_ENV !== "development"),
  FIREBASE_AUTH_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  FIREBASE_AUTH_COOKIE_DOMAIN: z.string().optional(),
  ACCESS_CONTROL_INTERNAL_TOKEN: z.string().min(32, "ACCESS_CONTROL_INTERNAL_TOKEN must be at least 32 characters"),
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: aesGcmKeySchema,
  CONTACT_EMAIL: z.string().email("CONTACT_EMAIL must be a valid email address"),
  ADMIN_EMAIL: z.string().email().optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_ENV: z
    .enum(["development", "preview", "production"])
    .default("development"),
  NEXT_PUBLIC_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NEXT_PUBLIC_FIREBASE_API_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_FIREBASE_API_KEY is required"),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z
    .string()
    .min(1, "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is required"),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.preprocess(
    stripInvisibleBoundary,
    z.string().min(1, "NEXT_PUBLIC_FIREBASE_PROJECT_ID is required"),
  ),
  NEXT_PUBLIC_CONTACT_EMAIL: z
    .string()
    .email("NEXT_PUBLIC_CONTACT_EMAIL must be a valid email address"),
  NEXT_PUBLIC_REPO_URL: z
    .string()
    .url("NEXT_PUBLIC_REPO_URL must be a valid URL"),
});

type Env = z.infer<typeof serverSchema> & z.infer<typeof clientSchema>;
let cachedEnv: Env | null = null;

export function validateEnv(): Env {
  if (!cachedEnv) {
    const serverEnv = serverSchema.parse(process.env);
    if (serverEnv.NODE_ENV === "production" && !serverEnv.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY) {
      throw new Error("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is required in production to keep Server Action encryption keys stable across instances.");
    }
    cachedEnv = {
      ...serverEnv,
      ...clientSchema.parse(process.env),
    };
  }
  return cachedEnv;
}

export const env = validateEnv();
