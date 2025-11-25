import { MODEL_TYPES, type ModelClient } from "../model-client";
import { renderPrompt } from "../prompts";
import { resolveContactIntel, resolveResearchBrief } from "../context";
import { clampStrategyForContext } from "../strategy-docs";
import type { GenericColdEmailInput, PersonalizedColdEmailInput } from "../service-types";
import { createDebugLogger } from "@/lib/debug-logger";

const logger = createDebugLogger("outreach-tasks");

export function createOutreachTasks(client: ModelClient) {
  return {
    async generatePersonalizedColdEmail(input: PersonalizedColdEmailInput): Promise<string> {
      logger.step("Generating personalized cold email", { companyName: input.companyName, targetPerson: input.contactName });
      const { researchBrief, contactIntelSummary, ...rest } = input;
      const { roleInsights, candidateInsights } = resolveResearchBrief(researchBrief);
      const prompt = renderPrompt("generatePersonalizedColdEmail", {
        ...rest,
        coldEmailStrategy: clampStrategyForContext("coldEmailStrategy", rest.coldEmailStrategy),
        roleInsights,
        candidateInsights,
        contactIntelSummary: resolveContactIntel(contactIntelSummary),
      });
      const result = await client.generateWithRetry(prompt, MODEL_TYPES.PRO);
      logger.info("Personalized cold email generated", { length: result.length });
      return result;
    },

    async generateGenericColdEmail(input: GenericColdEmailInput): Promise<string> {
      logger.step("Generating generic cold email", { companyName: input.companyName, targetEmail: input.genericEmail });
      const { researchBrief, contactIntelSummary, ...rest } = input;
      const { roleInsights, candidateInsights } = resolveResearchBrief(researchBrief);
      const prompt = renderPrompt("generateGenericColdEmail", {
        ...rest,
        coldEmailStrategy: clampStrategyForContext("coldEmailStrategy", rest.coldEmailStrategy),
        roleInsights,
        candidateInsights,
        contactIntelSummary: resolveContactIntel(contactIntelSummary),
      });
      const result = await client.generateWithRetry(prompt, MODEL_TYPES.PRO);
      logger.info("Generic cold email generated", { length: result.length });
      return result;
    },

    async parseColdOutreachInput(userInput: string): Promise<{
      companyName: string;
      domainName: string | null;
      targetPerson: string | null;
      roleContext: string | null;
    }> {
      logger.step("Parsing cold outreach input", { inputLength: userInput.length });
      const prompt = renderPrompt("parseColdOutreachInput", { userInput });
      const result = await client.generateJsonWithRetry<{
        companyName: string;
        domainName: string | null;
        targetPerson: string | null;
        roleContext: string | null;
      }>(prompt, MODEL_TYPES.FLASH);
      logger.info("Cold outreach input parsed", result);
      return result;
    },
  };
}
