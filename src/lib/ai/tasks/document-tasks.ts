import { MODEL_TYPES, type ModelClient } from "../model-client";
import { renderPrompt } from "../prompts";
import { resolveResearchBrief } from "../context";
import type {
  FixCVPageCountInput,
  GenerateCoverLetterInput,
  GenerateCVAdvancedInput,
  RefineContentInput,
} from "../service-types";
import { createDebugLogger } from "@/lib/debug-logger";

const logger = createDebugLogger("document-tasks");

export function createDocumentTasks(client: ModelClient) {
  return {
    async generateCVAdvanced(input: GenerateCVAdvancedInput): Promise<string> {
      logger.step("Generating advanced CV", { companyName: input.companyName, jobTitle: input.jobTitle });
      const { researchBrief, ...rest } = input;
      const { roleInsights, candidateInsights } = resolveResearchBrief(researchBrief);
      const prompt = renderPrompt("generateCVAdvanced", {
        ...rest,
        roleInsights,
        candidateInsights,
      });
      const result = await client.generateWithRetry(prompt, MODEL_TYPES.PRO);
      logger.info("CV generation complete", { length: result.length });
      return result;
    },

    async fixCVPageCount(input: FixCVPageCountInput): Promise<string> {
      const { actualPageCount, targetPageCount = 2 } = input;
      logger.step("Fixing CV page count", { actualPageCount, targetPageCount });
      if (actualPageCount === targetPageCount) {
        logger.info("CV page count already matches target", { actualPageCount });
        return input.failedCV;
      }
      const promptKey = actualPageCount > targetPageCount ? "fixCVTooLong" : "fixCVTooShort";
      const prompt = renderPrompt(promptKey, {
        failedCV: input.failedCV,
        actualPageCount: String(actualPageCount),
        targetPageCount: String(targetPageCount),
        jobDescription: input.jobDescription,
      });
      const result = await client.generateWithRetry(prompt, MODEL_TYPES.PRO);
      logger.info("CV page count fix complete", { length: result.length });
      return result;
    },

    async generateCoverLetter(input: GenerateCoverLetterInput): Promise<string> {
      logger.step("Generating cover letter", { companyName: input.companyName, jobTitle: input.jobTitle });
      const { researchBrief, ...rest } = input;
      const { roleInsights, candidateInsights } = resolveResearchBrief(researchBrief);
      const prompt = renderPrompt("generateCoverLetterAdvanced", {
        ...rest,
        currentDate:
          rest.currentDate ?? new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
        roleInsights,
        candidateInsights,
      });
      const result = await client.generateWithRetry(prompt, MODEL_TYPES.PRO);
      logger.info("Cover letter generation complete", { length: result.length });
      return result;
    },

    async refineContent(input: RefineContentInput): Promise<string> {
      logger.step("Refining content", { contentLength: input.content.length });
      const chatHistoryText = input.chatHistory?.length
        ? JSON.stringify(input.chatHistory.slice(-5), null, 2)
        : "No previous chat history";
      const prompt = renderPrompt("refineContentAdvanced", {
        chatHistoryText,
        content: input.content,
        feedback: input.feedback,
      });
      const result = await client.generateWithRetry(prompt, MODEL_TYPES.PRO);
      logger.info("Content refinement complete", { length: result.length });
      return result;
    },

    async summarizeCvChanges(originalCV: string, newCV: string): Promise<string> {
      logger.step("Summarizing CV changes");
      const prompt = renderPrompt("generateCVChangeSummary", { originalCV, newCV });
      const result = await client.generateWithRetry(prompt, MODEL_TYPES.FLASH);
      logger.info("CV change summary complete", { length: result.length });
      return result;
    },
  };
}
