import { aiService } from "@/lib/ai/service";
import type { ResearchBrief } from "@/lib/ai/llama/context-engine";

import type { ParsedForm } from "../form";
import { saveTextArtifact } from "../storage";
import { assertNotAborted } from "./errors";
import type { CvPersistence } from "./cv";
import type { EmitFn, ModelRetryNotifier } from "./types";

type CoverLetterParams = {
  parsed: ParsedForm;
  userId: string;
  researchBrief: ResearchBrief | null;
  cvPersistence: CvPersistence;
  emit: EmitFn;
  signal?: AbortSignal;
  modelRetryNotifier: ModelRetryNotifier;
};

export async function maybeGenerateCoverLetterArtifact({ parsed, userId, researchBrief, cvPersistence, emit, signal, modelRetryNotifier }: CoverLetterParams) {
  assertNotAborted(signal);
  await emit("Drafting cover letter...");
  const coverLetterResponse = await aiService.generateCoverLetterAdvanced({
    jobDescription: parsed.jobDescription,
    companyName: parsed.companyName,
    jobTitle: parsed.jobTitle,
    validatedCVText: parsed.validatedCVText || cvPersistence.cv,
    extensiveCV: parsed.extensiveCV,
    coverLetterStrategy: parsed.coverLetterStrategy,
    researchBrief: researchBrief ?? undefined,
  }, { onRetry: modelRetryNotifier });

  const coverLetterArtifact = await saveTextArtifact(
    coverLetterResponse,
    parsed,
    userId,
    "cover-letter.doc",
    "cover-letter",
    "Cover Letter (DOC)",
    "application/msword",
  );
  await emit("Cover letter saved to storage.");
  return coverLetterArtifact;
}