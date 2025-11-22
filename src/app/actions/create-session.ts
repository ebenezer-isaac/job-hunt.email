'use server';

import { z } from "zod";
import { requireServerAuthTokens } from "@/lib/auth";
import { sessionRepository } from "@/lib/session";
import { serializeSession } from "@/lib/serializers/session";
import { createDebugLogger } from "@/lib/debug-logger";

const logger = createDebugLogger("create-session-action");

const payloadSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  jobTitle: z.string().min(1, "Job title is required"),
  mode: z.enum(["standard", "cold_outreach"]).default("standard"),
  companyWebsite: z.string().optional().default(""),
  contactName: z.string().optional().default(""),
  contactTitle: z.string().optional().default(""),
  contactEmail: z.string().optional().default(""),
});

export type CreateSessionInput = z.infer<typeof payloadSchema>;

export async function createSessionAction(input: CreateSessionInput) {
  const parsed = payloadSchema.parse(input);
  const tokens = await requireServerAuthTokens();
  logger.step("Creating session", { userId: tokens.decodedToken.uid, companyName: parsed.companyName, jobTitle: parsed.jobTitle });
  const sanitizedWebsite = parsed.companyWebsite.trim();
  const sanitizedContactName = parsed.contactName.trim();
  const sanitizedContactTitle = parsed.contactTitle.trim();
  const sanitizedContactEmail = parsed.contactEmail.trim();

  const record = await sessionRepository.createSession({
    userId: tokens.decodedToken.uid,
    companyName: parsed.companyName,
    jobTitle: parsed.jobTitle,
    metadata: {
      companyName: parsed.companyName,
      jobTitle: parsed.jobTitle,
      mode: parsed.mode,
      ...(sanitizedWebsite ? { companyWebsite: sanitizedWebsite } : {}),
      ...(sanitizedContactName ? { contactName: sanitizedContactName } : {}),
      ...(sanitizedContactTitle ? { contactTitle: sanitizedContactTitle } : {}),
      ...(sanitizedContactEmail ? { contactEmail: sanitizedContactEmail } : {}),
    },
  });
  logger.info("Session created successfully", { sessionId: record.id, userId: tokens.decodedToken.uid });
  return serializeSession(record);
}
