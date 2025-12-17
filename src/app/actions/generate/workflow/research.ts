import type { ResearchBrief } from "@/lib/ai/llama/context-engine";
import { buildResearchBrief } from "@/lib/ai/llama/context-engine";

import type { ParsedForm } from "../form";
import { assertNotAborted, describeError, isAbortError, RequestAbortedError } from "./errors";
import type { ActionLogger, EmitFn } from "./types";

type ResearchParams = {
  parsed: ParsedForm;
  emit: EmitFn;
  signal?: AbortSignal;
  logger: ActionLogger;
};

export async function synthesizeResearchBrief({ parsed, emit, signal, logger }: ResearchParams): Promise<ResearchBrief | null> {
  try {
    assertNotAborted(signal);
    await emit("Synthesizing research brief with LlamaIndex...");
    const researchBrief = await buildResearchBrief({
      jobDescription: parsed.jobDescription,
      originalCV: parsed.originalCV,
      extensiveCV: parsed.extensiveCV,
      companyName: parsed.companyName,
      jobTitle: parsed.jobTitle,
    });

    if (researchBrief) {
      logger.data("research-brief-metadata", {
        roleInsightsLength: researchBrief.roleInsights?.length ?? 0,
        candidateInsightsLength: researchBrief.candidateInsights?.length ?? 0,
      });
    }

    await emit("Research brief ready — weaving insights into documents.");
    return researchBrief;
  } catch (researchError) {
    if (isAbortError(researchError, signal)) {
      throw new RequestAbortedError();
    }
    const info = describeError(researchError);
    logger.warn("Failed to build research brief", { sessionId: parsed.sessionId, error: info.message, errorName: info.name });
    await emit(`Research brief unavailable: ${info.message || info.name}`);
    return null;
  }
}