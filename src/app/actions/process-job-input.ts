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

const RECITATION_FLAG = "recitation";
const FALLBACK_USER_AGENT = "Mozilla/5.0 (compatible; JobHuntEmailBot/1.0; +https://job-hunt.email)";
const MAX_FETCHED_TEXT_LENGTH = 20000;

type StructuredJobFields = {
  jobDescription: string;
  companyName: string;
  jobTitle: string;
  companyProfile?: string;
};

type StructuredJobResponse = Partial<Pick<NormalizedJobInput, "jobDescription" | "companyName" | "jobTitle" | "companyProfile">> & Record<string, unknown>;

function resolveStructuredJobData(
  structured: StructuredJobResponse,
  current: StructuredJobFields,
): StructuredJobFields {
  const next: StructuredJobFields = { ...current };
  if (typeof structured.jobDescription === "string" && structured.jobDescription.trim()) {
    next.jobDescription = structured.jobDescription;
  }
  if (typeof structured.companyName === "string" && structured.companyName.trim()) {
    next.companyName = structured.companyName;
  }
  if (typeof structured.jobTitle === "string" && structured.jobTitle.trim()) {
    next.jobTitle = structured.jobTitle;
  }
  if (typeof structured.companyProfile === "string" && structured.companyProfile.trim()) {
    next.companyProfile = structured.companyProfile;
  }
  return next;
}

function isRecitationBlocked(message: string) {
  return message.toLowerCase().includes(RECITATION_FLAG);
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(\/?)(p|div|li|br|section|article|h[1-6]|tr|td)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[\r\t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

async function fetchJobPostingText(url: string): Promise<string | null> {
  // Minimal HTML fetch used when Gemini blocks tool-calling with RECITATION
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent": FALLBACK_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) {
      logger.warn("Fallback fetch failed", { url, status: response.status });
      return null;
    }
    const html = await response.text();
    const text = stripHtmlToText(html);
    if (!text) {
      return null;
    }
    return text.length > MAX_FETCHED_TEXT_LENGTH ? `${text.slice(0, MAX_FETCHED_TEXT_LENGTH)} ...(truncated)` : text;
  } catch (error) {
    logger.warn("Fallback fetch threw", { url, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

// Secondary ingestion path that converts fetched HTML into text before reusing job-text parsing prompts.
async function fallbackProcessJobUrl(url: string): Promise<{ structured: StructuredJobResponse; normalizedText: string } | null> {
  const fetchedText = await fetchJobPostingText(url);
  if (!fetchedText) {
    return null;
  }

  let normalizedText = fetchedText;
  try {
    normalizedText = await aiService.extractJobDescription(fetchedText);
  } catch (error) {
    logger.warn("extractJobDescription fallback failed", { error: error instanceof Error ? error.message : String(error) });
  }

  const structured = await aiService.processJobText(normalizedText) as StructuredJobResponse;
  return { structured, normalizedText };
}

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
      const structured = await aiService.processJobURL(trimmed) as StructuredJobResponse;
      ({ jobDescription, companyName, jobTitle, companyProfile } = resolveStructuredJobData(structured, {
        jobDescription,
        companyName,
        jobTitle,
        companyProfile,
      }));
      metadata.structured = structured;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("processJobURL failed", { message, url: trimmed });
      if (isRecitationBlocked(message)) {
        logger.warn("Recitation block detected, attempting fallback", { url: trimmed });
        try {
          const fallbackResult = await fallbackProcessJobUrl(trimmed);
          if (fallbackResult) {
            ({ jobDescription, companyName, jobTitle, companyProfile } = resolveStructuredJobData(
              fallbackResult.structured,
              {
                jobDescription: fallbackResult.normalizedText,
                companyName,
                jobTitle,
                companyProfile,
              },
            ));
            metadata.structured = fallbackResult.structured;
            metadata.fallback = {
              reason: "recitation_block",
              strategy: "manual_fetch",
            };
            logger.info("Fallback ingestion succeeded", { url: trimmed });
          } else {
            throw new Error("Fallback ingestion returned empty content");
          }
        } catch (fallbackError) {
          logger.error("Fallback ingestion failed", {
            url: trimmed,
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          });
          throw new Error("Gemini was unable to process the provided job URL");
        }
      } else {
        throw new Error("Gemini was unable to process the provided job URL");
      }
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

  logger.info("Job input processed", {
    companyName,
    jobTitle,
    wasUrl: isUrl,
    emailCount: emailAddresses.length,
  });

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
