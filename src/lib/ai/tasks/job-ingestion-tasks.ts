import { MODEL_TYPES, type ModelClient, type RetryHandler } from "../model-client";
import { renderPrompt } from "../prompts";
import { createDebugLogger } from "@/lib/debug-logger";

const logger = createDebugLogger("job-ingestion-tasks");

type TaskOptions = { onRetry?: RetryHandler };

export function createJobIngestionTasks(client: ModelClient) {
  return {
    async extractJobDescription(rawContent: string, options?: TaskOptions): Promise<string> {
      logger.step("Extracting job description", { rawContentLength: rawContent.length });
      const truncated = rawContent.length > 10000 ? `${rawContent.slice(0, 10000)} ...(truncated)` : rawContent;
      const prompt = renderPrompt("extractJobDescription", { rawContent: truncated });
      const result = await client.generateWithRetry(prompt, MODEL_TYPES.FLASH, undefined, options?.onRetry);
      logger.info("Job description extracted", { length: result.length });
      return result;
    },

    async extractJobDetails(jobDescription: string, options?: TaskOptions): Promise<{ companyName: string; jobTitle: string }> {
      logger.step("Extracting job details");
      const prompt = renderPrompt("extractJobDetails", { jobDescription });
      try {
        const result = await client.generateJsonWithRetry<{ companyName: string; jobTitle: string }>(
          prompt,
          MODEL_TYPES.FLASH,
          undefined,
          options?.onRetry,
        );
        logger.info("Job details extracted", result);
        return result;
      } catch (error) {
        logger.warn("Failed to parse job details", { error: error instanceof Error ? error.message : String(error) });
        return { companyName: "Unknown Company", jobTitle: "Position" };
      }
    },

    extractEmailAddresses(jobDescription: string): string[] {
      logger.step("Extracting email addresses");
      const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
      const emails = [...new Set(jobDescription.match(emailRegex) ?? [])];
      logger.info("Email addresses extracted", { count: emails.length, emails });
      return emails;
    },

    async processJobURL(url: string, options?: TaskOptions): Promise<Record<string, unknown>> {
      logger.step("Processing job URL", { url });
      const prompt = renderPrompt("processJobURL", { url });
      try {
        const jobData = await client.generateJsonWithRetry<Record<string, unknown>>(
          prompt,
          MODEL_TYPES.FLASH,
          // @ts-expect-error - googleSearch is not yet in the Tool type definition
          [{ googleSearch: {} }],
          options?.onRetry,
        );
        logger.info("Parsed job data from URL", { url });
        return jobData;
      } catch (error) {
        logger.error("Failed to parse job data from URL", { url, error: error instanceof Error ? error.message : String(error) });
        throw new Error(`Failed to parse job data from URL: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    async processJobText(jobText: string, options?: TaskOptions): Promise<Record<string, unknown>> {
      logger.step("Processing job text", { length: jobText.length });
      const prompt = renderPrompt("processJobText", { jobText });
      try {
        const jobData = await client.generateJsonWithRetry<Record<string, unknown>>(
          prompt,
          MODEL_TYPES.FLASH,
          undefined,
          options?.onRetry,
        );
        logger.info("Parsed job data from text");
        return jobData;
      } catch (error) {
        logger.error("Failed to parse job data from text", { error: error instanceof Error ? error.message : String(error) });
        throw new Error(`Failed to parse job data from text: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };
}
