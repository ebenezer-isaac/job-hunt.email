/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
exports.validateEnv = validateEnv;
const zod_1 = require("zod");
const debug_logger_1 = require("./lib/debug-logger");
const envLogger = (0, debug_logger_1.createDebugLogger)("env");
envLogger.step("Initializing environment schema setup");
const booleanFromEnv = (defaultValue) => zod_1.z.preprocess((value) => {
    envLogger.step("Normalizing boolean env variable", { raw: value, defaultValue });
    if (typeof value === "boolean") {
        envLogger.data("boolean-direct", value);
        return value;
    }
    if (typeof value === "string") {
        if (value.toLowerCase() === "true") {
            envLogger.data("boolean-string-true", value);
            return true;
        }
        if (value.toLowerCase() === "false") {
            envLogger.data("boolean-string-false", value);
            return false;
        }
    }
    if (value === undefined || value === null) {
        envLogger.step("Boolean env missing; using default", { defaultValue });
        return defaultValue;
    }
    envLogger.warn("Unexpected boolean env payload", { value });
    return value;
}, zod_1.z.boolean());
const signatureKeysSchema = zod_1.z
    .string()
    .transform((value) => {
    envLogger.step("Parsing signature keys", { raw: value });
    const keys = value
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean);
    envLogger.data("signature-keys", keys);
    return keys;
})
    .refine((keys) => keys.length > 0, {
    message: "Provide at least one cookie signature key",
})
    .refine((keys) => keys.every((key) => key.length >= 32), {
    message: "Cookie signature keys must be at least 32 characters",
});
const serverSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(["development", "test", "production"]).default("development"),
    PORT: zod_1.z.coerce.number().int().positive().default(3000),
    GEMINI_API_KEY: zod_1.z.string().min(1, "GEMINI_API_KEY is required"),
    APOLLO_API_KEY: zod_1.z.string().min(1, "APOLLO_API_KEY is required"),
    GEMINI_PRO_MODEL: zod_1.z.string().default("gemini-2.5-pro"),
    GEMINI_FLASH_MODEL: zod_1.z.string().default("gemini-2.5-flash"),
    AI_MAX_RETRIES: zod_1.z.coerce.number().int().min(1).default(5),
    AI_INITIAL_RETRY_DELAY: zod_1.z.coerce.number().int().min(1000).default(5000),
    TARGET_PAGE_COUNT: zod_1.z.coerce.number().int().min(1).default(2),
    MAX_CONTENT_LENGTH: zod_1.z.coerce.number().int().min(1).default(50000),
    SCRAPING_TIMEOUT: zod_1.z.coerce.number().int().min(1000).default(30000),
    USER_NAME: zod_1.z.string().default("ebenezer-isaac"),
    PDFLATEX_COMMAND: zod_1.z.string().default("pdflatex"),
    FIREBASE_PROJECT_ID: zod_1.z.string().min(1, "FIREBASE_PROJECT_ID is required"),
    FIREBASE_CLIENT_EMAIL: zod_1.z.string().email("Provide a valid FIREBASE_CLIENT_EMAIL"),
    FIREBASE_PRIVATE_KEY: zod_1.z.string().min(1, "FIREBASE_PRIVATE_KEY is required"),
    FIREBASE_API_KEY: zod_1.z.string().min(1, "FIREBASE_API_KEY is required"),
    FIREBASE_AUTH_COOKIE_NAME: zod_1.z.string().min(1).default("cv-customiser-auth"),
    FIREBASE_AUTH_COOKIE_SIGNATURE_KEYS: signatureKeysSchema,
    FIREBASE_AUTH_COOKIE_MAX_AGE_SECONDS: zod_1.z
        .coerce
        .number()
        .int()
        .positive()
        .default(60 * 60 * 4),
    FIREBASE_AUTH_COOKIE_SECURE: booleanFromEnv(process.env.NODE_ENV !== "development"),
    FIREBASE_AUTH_COOKIE_SAME_SITE: zod_1.z.enum(["lax", "strict", "none"]).default("lax"),
    FIREBASE_AUTH_COOKIE_DOMAIN: zod_1.z.string().optional(),
});
const clientSchema = zod_1.z.object({
    NEXT_PUBLIC_APP_ENV: zod_1.z
        .enum(["development", "preview", "production"])
        .default("development"),
    NEXT_PUBLIC_FIREBASE_API_KEY: zod_1.z
        .string()
        .min(1, "NEXT_PUBLIC_FIREBASE_API_KEY is required"),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: zod_1.z
        .string()
        .min(1, "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is required"),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: zod_1.z
        .string()
        .min(1, "NEXT_PUBLIC_FIREBASE_PROJECT_ID is required"),
});
let cachedEnv = null;
function validateEnv() {
    if (!cachedEnv) {
        envLogger.step("Validating environment variables now");
        cachedEnv = {
            ...serverSchema.parse(process.env),
            ...clientSchema.parse(process.env),
        };
        envLogger.data("validated-env", {
            NODE_ENV: cachedEnv.NODE_ENV,
            PORT: cachedEnv.PORT,
            FIREBASE_PROJECT_ID: cachedEnv.FIREBASE_PROJECT_ID,
            FIREBASE_CLIENT_EMAIL: cachedEnv.FIREBASE_CLIENT_EMAIL,
            COOKIE_KEY_COUNT: cachedEnv.FIREBASE_AUTH_COOKIE_SIGNATURE_KEYS.length,
            NEXT_PUBLIC_FIREBASE_PROJECT_ID: cachedEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        });
    }
    return cachedEnv;
}
exports.env = validateEnv();
envLogger.step("Environment bootstrap complete");
