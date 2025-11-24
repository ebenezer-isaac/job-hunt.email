import { MODEL_TYPES, type ModelClient } from "../model-client";
import { renderPrompt } from "../prompts";
import type { ResearchCompanyInput } from "../service-types";
import { clampStrategyForContext } from "../strategy-docs";
import { createDebugLogger } from "@/lib/debug-logger";

const logger = createDebugLogger("research-tasks");

export function createResearchTasks(client: ModelClient) {
  return {
    async researchCompany(input: ResearchCompanyInput): Promise<Record<string, unknown>> {
      logger.step("Researching company", { companyName: input.companyName });
      const prompt = renderPrompt("researchCompanyAndIdentifyPeople", {
        companyName: input.companyName,
        roleContext: input.roleContext ?? "",
        originalCV: input.originalCV,
        reconStrategy: clampStrategyForContext("reconStrategy", input.reconStrategy),
      });
      try {
        const result = await client.generateJsonWithRetry<Record<string, unknown>>(
          prompt,
          MODEL_TYPES.PRO,
          // @ts-expect-error - googleSearch is not yet in the Tool type definition
          [{ googleSearch: {} }]
        );
        logger.info("Company research complete", { companyName: input.companyName });
        return result;
      } catch (error) {
        logger.warn("Failed to research company", { error: error instanceof Error ? error.message : String(error) });
        return {
          company_intelligence: {
            description: "Unable to research company.",
            industry: "Unknown",
            size: "Unknown",
            recentNews: "Unable to fetch",
            technologies: [],
            genericEmail: null,
          },
          decision_makers: [],
          strategicInsights: {
            painPoints: [],
            opportunities: [],
            openRoles: [],
          },
        };
      }
    },

    async getIntelligence(personName: string, companyName: string): Promise<string[]> {
      logger.step("Gathering intelligence", { personName, companyName });
      const prompt = renderPrompt("getIntelligence", { personName, companyName });
      try {
        const result = await client.generateJsonWithRetry<{ jobTitles: string[] }>(prompt, MODEL_TYPES.FLASH);
        logger.info("Intelligence gathered", { personName, companyName, jobTitlesCount: result.jobTitles?.length });
        return result.jobTitles ?? [];
      } catch (error) {
        logger.warn("Failed to get intelligence", { error: error instanceof Error ? error.message : String(error) });
        return ["CEO", "CTO", "VP of Engineering", "Head of Engineering", "Engineering Manager"];
      }
    },
  };
}
