import { MODEL_TYPES, type ModelClient } from "../model-client";
import { renderPrompt } from "../prompts";
import { resolveContactIntel, resolveResearchBrief } from "../context";
import type { GenericColdEmailInput, PersonalizedColdEmailInput } from "../service-types";

export function createOutreachTasks(client: ModelClient) {
  return {
    async generatePersonalizedColdEmail(input: PersonalizedColdEmailInput): Promise<string> {
      const { researchBrief, contactIntelSummary, ...rest } = input;
      const { roleInsights, candidateInsights } = resolveResearchBrief(researchBrief);
      const prompt = renderPrompt("generatePersonalizedColdEmail", {
        ...rest,
        roleInsights,
        candidateInsights,
        contactIntelSummary: resolveContactIntel(contactIntelSummary),
      });
      return client.generateWithRetry(prompt, MODEL_TYPES.PRO);
    },

    async generateGenericColdEmail(input: GenericColdEmailInput): Promise<string> {
      const { researchBrief, contactIntelSummary, ...rest } = input;
      const { roleInsights, candidateInsights } = resolveResearchBrief(researchBrief);
      const prompt = renderPrompt("generateGenericColdEmail", {
        ...rest,
        roleInsights,
        candidateInsights,
        contactIntelSummary: resolveContactIntel(contactIntelSummary),
      });
      return client.generateWithRetry(prompt, MODEL_TYPES.PRO);
    },

    async parseColdOutreachInput(userInput: string): Promise<{
      companyName: string;
      domainName: string | null;
      targetPerson: string | null;
      roleContext: string | null;
    }> {
      const prompt = renderPrompt("parseColdOutreachInput", { userInput });
      return client.generateJsonWithRetry<{
        companyName: string;
        domainName: string | null;
        targetPerson: string | null;
        roleContext: string | null;
      }>(prompt, MODEL_TYPES.FLASH);
    },
  };
}
