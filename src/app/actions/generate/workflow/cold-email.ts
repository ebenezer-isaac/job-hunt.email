import type { ResearchBrief } from "@/lib/ai/llama/context-engine";

import type { ParsedForm } from "../form";
import { buildColdEmail, parseColdEmailStructure } from "../cold-email";
import type { StoredArtifact } from "../storage";
import { saveTextArtifact } from "../storage";
import { assertNotAborted } from "./errors";
import type { CvPersistence } from "./cv";
import type { EmitFn, ModelRetryNotifier } from "./types";

type ColdEmailParams = {
  parsed: ParsedForm;
  userId: string;
  researchBrief: ResearchBrief | null;
  contactIntelSummary: string | null;
  cvPersistence: CvPersistence;
  parsedEmails: string[];
  emit: EmitFn;
  signal?: AbortSignal;
  modelRetryNotifier: ModelRetryNotifier;
};

export async function maybeGenerateColdEmailArtifact({
  parsed,
  userId,
  researchBrief,
  contactIntelSummary,
  cvPersistence,
  parsedEmails,
  emit,
  signal,
  modelRetryNotifier,
}: ColdEmailParams): Promise<StoredArtifact | null> {
  assertNotAborted(signal);
  await emit("Preparing cold email...");
  const coldEmailResponse = await buildColdEmail(
    parsed,
    parsed.validatedCVText || cvPersistence.cv,
    { researchBrief, contactIntelSummary },
    { onRetry: modelRetryNotifier },
  );

  const coldEmailStructure = parseColdEmailStructure(coldEmailResponse);
  const emailTarget = parsed.contactEmail || parsed.genericEmail || parsedEmails[0] || "hello@example.com";
  const coldEmailArtifact = await saveTextArtifact(
    coldEmailResponse,
    parsed,
    userId,
    "cold-email.txt",
    "cold-email",
    "Cold Email (TXT)",
  );
  coldEmailArtifact.payload.emailAddresses = parsedEmails;
  coldEmailArtifact.payload.subject = coldEmailStructure.subject;
  coldEmailArtifact.payload.body = coldEmailStructure.body;
  coldEmailArtifact.payload.toAddress = emailTarget;
  await emit(`Cold email ready for ${emailTarget}.`);
  return coldEmailArtifact;
}