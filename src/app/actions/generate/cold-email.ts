import { aiService } from "@/lib/ai/service";
import { apolloService } from "@/lib/services/apollo-service";
import type { ResearchBrief } from "@/lib/ai/llama/context-engine";

import type { ParsedForm } from "./form";

type EmitFn = (message: string) => Promise<void>;

type ColdEmailContext = {
  researchBrief?: ResearchBrief | null;
  contactIntelSummary?: string | null;
};

export function parseColdEmailStructure(content: string): { subject: string; body: string } {
  const normalized = content.replace(/\r/g, "");
  const lines = normalized.split("\n");
  const subjectLineIndex = lines.findIndex((line) => /^subject:/i.test(line));
  if (subjectLineIndex >= 0) {
    const subject = lines[subjectLineIndex].replace(/^subject:/i, "").trim();
    const body = lines.slice(subjectLineIndex + 1).join("\n").trim();
    return {
      subject: subject || "Opportunity to connect",
      body: body || normalized.trim(),
    };
  }

  const firstLine = lines.find((line) => line.trim().length > 0) ?? "Opportunity to connect";
  const bodyStartIndex = lines.findIndex((line) => line.trim().length > 0);
  const body = bodyStartIndex >= 0 ? lines.slice(bodyStartIndex + 1).join("\n").trim() : normalized.trim();
  return {
    subject: firstLine.trim(),
    body: body || normalized.trim(),
  };
}

export function normalizeDomain(url?: string): string | null {
  if (!url) {
    return null;
  }
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

export async function maybeEnrichContactWithApollo(parsed: ParsedForm, emit: EmitFn) {
  if (parsed.mode !== "cold_outreach") {
    return;
  }
  const needsEnrichment = !parsed.contactEmail?.trim() || !parsed.contactName?.trim();
  if (!needsEnrichment) {
    return;
  }
  if (!apolloService.isEnabled()) {
    await emit("Apollo enrichment skipped: API key missing.");
    return;
  }
  const domain = normalizeDomain(parsed.companyWebsite) ?? normalizeDomain(parsed.jobSourceUrl);
  if (!domain) {
    await emit("Apollo enrichment skipped: Unable to derive company domain.");
    return;
  }
  await emit("Searching Apollo for verified decision-makers...");
  try {
    const preferredName = parsed.contactName?.trim() || parsed.jobTitle || parsed.companyName;
    const contact = await apolloService.findContact({
      personName: preferredName,
      companyName: parsed.companyName,
      companyDomain: domain,
      logCallback: (message, level) => {
        const prefix = level === "error" ? "✗" : level === "success" ? "✓" : "-";
        void emit(`[Apollo] ${prefix} ${message}`);
      },
    });
    if (!contact) {
      await emit("Apollo did not return a usable contact.");
      return;
    }
    if (contact.name) {
      parsed.contactName = contact.name;
    }
    if (contact.title) {
      parsed.contactTitle = contact.title;
    }
    if (contact.email) {
      parsed.contactEmail = contact.email;
    }
    await emit("Apollo enrichment complete.");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    await emit(`Apollo enrichment failed: ${reason}`);
  }
}

export async function buildColdEmail(
  parsed: ParsedForm,
  validatedCVText: string,
  context: ColdEmailContext,
): Promise<string> {
  if (parsed.contactName && parsed.contactEmail) {
    return aiService.generatePersonalizedColdEmail({
      companyName: parsed.companyName,
      companyProfile: parsed.companyProfile,
      contactName: parsed.contactName,
      contactTitle: parsed.contactTitle || "Hiring Manager",
      contactEmail: parsed.contactEmail,
      validatedCVText,
      extensiveCV: parsed.extensiveCV,
      coldEmailStrategy: parsed.coldEmailStrategy,
      researchBrief: context.researchBrief || undefined,
      contactIntelSummary: context.contactIntelSummary || undefined,
    });
  }

  return aiService.generateGenericColdEmail({
    companyName: parsed.companyName,
    companyProfile: parsed.companyProfile,
    genericEmail: parsed.genericEmail || "hello@example.com",
    validatedCVText,
    extensiveCV: parsed.extensiveCV,
    coldEmailStrategy: parsed.coldEmailStrategy,
    researchBrief: context.researchBrief || undefined,
    contactIntelSummary: context.contactIntelSummary || undefined,
  });
}
