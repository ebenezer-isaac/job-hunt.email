import { buildContactIntelSummary } from "@/lib/ai/llama/context-engine";

import type { ParsedForm } from "../form";
import { maybeEnrichContactWithApollo } from "../cold-email";
import { assertNotAborted } from "./errors";
import type { ActionLogger, EmitFn } from "./types";

type ContactIntelParams = {
  parsed: ParsedForm;
  emit: EmitFn;
  signal?: AbortSignal;
  logger: ActionLogger;
  shouldGenerateColdEmail: boolean;
};

export async function enrichContactData(parsed: ParsedForm, emit: EmitFn) {
  await maybeEnrichContactWithApollo(parsed, emit);
}

export function includePrimaryContactEmail(parsed: ParsedForm, parsedEmails: string[]) {
  if (parsed.contactEmail && !parsedEmails.includes(parsed.contactEmail)) {
    parsedEmails.unshift(parsed.contactEmail);
  }
}

export async function maybeBuildContactIntelSummary({ parsed, emit, signal, logger, shouldGenerateColdEmail }: ContactIntelParams): Promise<string | null> {
  if (!shouldGenerateColdEmail || (!parsed.contactName && !parsed.contactEmail)) {
    return null;
  }

  try {
    assertNotAborted(signal);
    await emit("Building contact intelligence dossier...");
    const linkedinUrl = parsed.jobSourceUrl && parsed.jobSourceUrl.toLowerCase().includes("linkedin.com")
      ? parsed.jobSourceUrl
      : undefined;
    const contactIntelSummary = await buildContactIntelSummary({
      contactName: parsed.contactName || undefined,
      contactTitle: parsed.contactTitle || undefined,
      companyName: parsed.companyName,
      companyProfile: parsed.companyProfile || undefined,
      email: parsed.contactEmail || undefined,
      linkedinUrl,
    });
    if (contactIntelSummary) {
      logger.data("contact-intel-metadata", {
        length: contactIntelSummary.length,
      });
      await emit("Contact intel ready — personalizing outreach.");
    } else {
      await emit("Contact intel skipped: insufficient data.");
    }
    return contactIntelSummary;
  } catch (contactError) {
    const reason = contactError instanceof Error ? contactError.message : String(contactError);
    logger.warn("Failed to build contact intel", { sessionId: parsed.sessionId, error: reason });
    await emit(`Contact intel unavailable: ${reason}`);
    return null;
  }
}