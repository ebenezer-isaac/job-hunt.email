'use server';

import { z } from "zod";
import { aiService } from "@/lib/ai/service";
import { isLikelyJobUrl } from "@/lib/url-utils";
import { createDebugLogger } from "@/lib/debug-logger";

const logger = createDebugLogger("process-job-input");

const payloadSchema = z.object({
  jobInput: z.string().min(1, "Provide job text or a URL"),
});

export type ProcessJobInput = z.infer<typeof payloadSchema>;

export type NormalizedJobInput = {
  jobDescription: string;
  companyName: string;
  jobTitle: string;
  companyProfile?: string;
  jobUrl?: string | null;
  wasUrl: boolean;
  emailAddresses: string[];
  metadata: Record<string, unknown>;
};

export async function processJobInputAction(input: ProcessJobInput): Promise<NormalizedJobInput> {
  const parsed = payloadSchema.parse(input);
  const trimmed = parsed.jobInput.trim();
  const isUrl = isLikelyJobUrl(trimmed);
  logger.step("Processing job input", { isUrl });

  let jobDescription = isUrl ? "" : trimmed;
  let companyName = "";
  let jobTitle = "";
  let companyProfile: string | undefined;
  const metadata: Record<string, unknown> = {};

  if (isUrl) {
    metadata.source = "url";
    metadata.originalUrl = trimmed;
    try {
      const structured = await aiService.processJobURL(trimmed);
      jobDescription = typeof structured.jobDescription === "string" ? structured.jobDescription : jobDescription;
      companyName = String(structured.companyName ?? companyName);
      jobTitle = String(structured.jobTitle ?? jobTitle);
      companyProfile = typeof structured.companyProfile === "string" ? structured.companyProfile : undefined;
      metadata.structured = structured;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("processJobURL failed", { message, url: trimmed });
      throw new Error("Gemini was unable to process the provided job URL");
    }
  } else {
    metadata.source = "text";
    try {
      const structured = await aiService.processJobText(trimmed);
      jobDescription = typeof structured.jobDescription === "string" ? structured.jobDescription : jobDescription;
      companyName = String(structured.companyName ?? companyName);
      jobTitle = String(structured.jobTitle ?? jobTitle);
      companyProfile = typeof structured.companyProfile === "string" ? structured.companyProfile : undefined;
      metadata.structured = structured;
    } catch (error) {
      logger.warn("processJobText failed, using raw input", {
        error: error instanceof Error ? error.message : String(error),
      });
      const details = await aiService.extractJobDetails(jobDescription);
      companyName = details.companyName;
      jobTitle = details.jobTitle;
    }
  }

  if (!companyName.trim()) {
    companyName = "Unknown Company";
  }
  if (!jobTitle.trim()) {
    jobTitle = "Open Role";
  }
  if (!jobDescription.trim()) {
    jobDescription = trimmed;
  }

  const emailAddresses = aiService.extractEmailAddresses(jobDescription);

  return {
    jobDescription,
    companyName,
    jobTitle,
    companyProfile,
    jobUrl: isUrl ? trimmed : null,
    wasUrl: isUrl,
    emailAddresses,
    metadata,
  };
}
