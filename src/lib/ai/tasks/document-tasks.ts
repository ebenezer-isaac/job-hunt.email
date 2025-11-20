import { MODEL_TYPES, type ModelClient } from "../model-client";
import { renderPrompt } from "../prompts";
import { resolveResearchBrief } from "../context";
import type {
  FixCVPageCountInput,
  GenerateCoverLetterInput,
  GenerateCVAdvancedInput,
  RefineContentInput,
} from "../service-types";

export function createDocumentTasks(client: ModelClient) {
  return {
    async generateCVAdvanced(input: GenerateCVAdvancedInput): Promise<string> {
      const { researchBrief, ...rest } = input;
      const { roleInsights, candidateInsights } = resolveResearchBrief(researchBrief);
      const prompt = renderPrompt("generateCVAdvanced", {
        ...rest,
        roleInsights,
        candidateInsights,
      });
      return client.generateWithRetry(prompt, MODEL_TYPES.PRO);
    },

    async fixCVPageCount(input: FixCVPageCountInput): Promise<string> {
      const { actualPageCount, targetPageCount = 2 } = input;
      if (actualPageCount === targetPageCount) {
        return input.failedCV;
      }
      const promptKey = actualPageCount > targetPageCount ? "fixCVTooLong" : "fixCVTooShort";
      const prompt = renderPrompt(promptKey, {
        failedCV: input.failedCV,
        actualPageCount: String(actualPageCount),
        targetPageCount: String(targetPageCount),
        jobDescription: input.jobDescription,
      });
      return client.generateWithRetry(prompt, MODEL_TYPES.PRO);
    },

    async generateCoverLetter(input: GenerateCoverLetterInput): Promise<string> {
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
      return client.generateWithRetry(prompt, MODEL_TYPES.PRO);
    },

    async refineContent(input: RefineContentInput): Promise<string> {
      const chatHistoryText = input.chatHistory?.length
        ? JSON.stringify(input.chatHistory.slice(-5), null, 2)
        : "No previous chat history";
      const prompt = renderPrompt("refineContentAdvanced", {
        chatHistoryText,
        content: input.content,
        feedback: input.feedback,
      });
      return client.generateWithRetry(prompt, MODEL_TYPES.PRO);
    },

    async summarizeCvChanges(originalCV: string, newCV: string): Promise<string> {
      const prompt = renderPrompt("generateCVChangeSummary", { originalCV, newCV });
      return client.generateWithRetry(prompt, MODEL_TYPES.FLASH);
    },
  };
}
