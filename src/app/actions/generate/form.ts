import { z } from "zod";
import { env } from "@/env";
import { createDebugLogger } from "@/lib/debug-logger";

const logger = createDebugLogger("form-schema");

const LARGE_TEXT_LIMIT = env.MAX_CONTENT_LENGTH;
const MEDIUM_TEXT_LIMIT = Math.min(8000, env.MAX_CONTENT_LENGTH);
const SMALL_TEXT_LIMIT = 512;
const URL_TEXT_LIMIT = 2048;
const EMAIL_LIST_LIMIT = Math.min(4096, env.MAX_CONTENT_LENGTH);
const MAX_FORM_PAYLOAD_BYTES = env.MAX_CONTENT_LENGTH * 5;

const requiredLargeField = (field: string) =>
  z
    .string()
    .min(1, `${field} is required`)
    .max(LARGE_TEXT_LIMIT, `${field} exceeds ${LARGE_TEXT_LIMIT} characters`);

const requiredLabelField = (field: string) =>
  z
    .string()
    .min(1, `${field} is required`)
    .max(SMALL_TEXT_LIMIT, `${field} exceeds ${SMALL_TEXT_LIMIT} characters`);

const optionalLimitedField = (limit: number) =>
  z
    .string()
    .max(limit, `Value exceeds ${limit} characters`)
    .optional()
    .default("");

export class FormPayloadTooLargeError extends Error {
  constructor(public readonly limitBytes: number, public readonly actualBytes: number) {
    super(`Form payload exceeds ${limitBytes} bytes`);
    this.name = "FormPayloadTooLargeError";
  }
}

export const formSchema = z.object({
  sessionId: requiredLabelField("sessionId"),
  generationId: requiredLabelField("generationId"),
  jobDescription: requiredLargeField("jobDescription"),
  originalCV: requiredLargeField("originalCV"),
  extensiveCV: requiredLargeField("extensiveCV"),
  cvStrategy: requiredLargeField("cvStrategy"),
  companyName: requiredLabelField("companyName"),
  jobTitle: requiredLabelField("jobTitle"),
  companyWebsite: optionalLimitedField(URL_TEXT_LIMIT),
  coverLetterStrategy: optionalLimitedField(LARGE_TEXT_LIMIT),
  coldEmailStrategy: optionalLimitedField(LARGE_TEXT_LIMIT),
  validatedCVText: optionalLimitedField(LARGE_TEXT_LIMIT),
  contactName: optionalLimitedField(SMALL_TEXT_LIMIT),
  contactTitle: optionalLimitedField(SMALL_TEXT_LIMIT),
  contactEmail: optionalLimitedField(SMALL_TEXT_LIMIT),
  companyProfile: optionalLimitedField(MEDIUM_TEXT_LIMIT),
  genericEmail: optionalLimitedField(MEDIUM_TEXT_LIMIT),
  jobSourceUrl: optionalLimitedField(URL_TEXT_LIMIT),
  emailAddresses: optionalLimitedField(EMAIL_LIST_LIMIT),
  mode: z.enum(["standard", "cold_outreach"]).default("standard"),
});

export type ParsedForm = z.infer<typeof formSchema>;

export function normalizeFormData(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  let totalBytes = 0;
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      result[key] = value;
      totalBytes += Buffer.byteLength(value, "utf-8");
    }
  }
  if (totalBytes > MAX_FORM_PAYLOAD_BYTES) {
    logger.error("Form payload rejected", {
      fieldCount: Object.keys(result).length,
      totalBytes,
      limit: MAX_FORM_PAYLOAD_BYTES,
    });
    throw new FormPayloadTooLargeError(MAX_FORM_PAYLOAD_BYTES, totalBytes);
  }
  logger.step("FormData normalized", { fieldCount: Object.keys(result).length, totalBytes });
  return result;
}
