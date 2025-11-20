import { MODEL_TYPES, type ModelClient } from "../model-client";
import { renderPrompt } from "../prompts";
import type { DebugLogger } from "@/lib/debug-logger";

export function createJobIngestionTasks(client: ModelClient, logger: DebugLogger) {
  return {
    async extractJobDescription(rawContent: string): Promise<string> {
      const truncated = rawContent.length > 10000 ? `${rawContent.slice(0, 10000)} ...(truncated)` : rawContent;
      const prompt = renderPrompt("extractJobDescription", { rawContent: truncated });
      return client.generateWithRetry(prompt, MODEL_TYPES.FLASH);
    },

    async extractJobDetails(jobDescription: string): Promise<{ companyName: string; jobTitle: string }> {
      const prompt = renderPrompt("extractJobDetails", { jobDescription });
      try {
        return await client.generateJsonWithRetry<{ companyName: string; jobTitle: string }>(prompt, MODEL_TYPES.FLASH);
      } catch (error) {
        logger.warn("Failed to parse job details", { error: error instanceof Error ? error.message : String(error) });
        return { companyName: "Unknown Company", jobTitle: "Position" };
      }
    },

    extractEmailAddresses(jobDescription: string): string[] {
      const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
      return [...new Set(jobDescription.match(emailRegex) ?? [])];
    },

    async processJobURL(url: string): Promise<Record<string, unknown>> {
      const prompt = renderPrompt("processJobURL", { url });
      try {
        const jobData = await client.generateJsonWithRetry<Record<string, unknown>>(prompt, MODEL_TYPES.FLASH);
        logger.step("Parsed job data from URL", { url });
        return jobData;
      } catch (error) {
        logger.error("Failed to parse job data from URL", { url, error: error instanceof Error ? error.message : String(error) });
        throw new Error(`Failed to parse job data from URL: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    async processJobText(jobText: string): Promise<Record<string, unknown>> {
      const prompt = renderPrompt("processJobText", { jobText });
      try {
        const jobData = await client.generateJsonWithRetry<Record<string, unknown>>(prompt, MODEL_TYPES.FLASH);
        logger.step("Parsed job data from text");
        return jobData;
      } catch (error) {
        logger.error("Failed to parse job data from text", { error: error instanceof Error ? error.message : String(error) });
        throw new Error(`Failed to parse job data from text: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };
}
