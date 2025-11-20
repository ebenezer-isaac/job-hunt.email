import "server-only";

import { z } from "zod";

import { createDebugLogger } from "@/lib/debug-logger";
import { renderPrompt } from "@/lib/ai/prompts";
import { ensureLlamaRuntime } from "@/lib/ai/llama/runtime";
import { ensureStaticDocuments } from "@/lib/ai/llama/vector-store";
import {
  buildCandidateDocument,
  buildContactDocuments,
  buildJobDocument,
  loadReconDocument,
  truncateText,
} from "@/lib/ai/llama/documents";
import { queryDocuments } from "@/lib/ai/llama/document-query";
import { parseStructuredResponse } from "@/lib/ai/llama/structured-output";

const logger = createDebugLogger("llama-context");
ensureLlamaRuntime();

const RoleInsightsSchema = z.object({
  painPoints: z.array(z.string()).min(1).max(5),
  opportunities: z.array(z.string()).min(1).max(5),
  keywords: z.array(z.string()).min(1).max(10),
  personas: z.array(z.string()).min(1).max(5),
});

const CandidateInsightsSchema = z.object({
  quantifiedWins: z.array(z.string()).min(1).max(5),
  wiiftAngles: z.array(z.string()).min(1).max(5),
});

const ContactIntelSchema = z.object({
  background: z.string().min(1),
  currentFocus: z.string().min(1),
  hook: z.string().min(1),
});

type RoleInsightsPayload = z.infer<typeof RoleInsightsSchema>;
type CandidateInsightsPayload = z.infer<typeof CandidateInsightsSchema>;
type ContactIntelPayload = z.infer<typeof ContactIntelSchema>;

function formatRoleInsights(payload: RoleInsightsPayload): string {
  return [
    "### Pain Points",
    ...payload.painPoints.map((item) => `- ${item}`),
    "\n### Opportunities",
    ...payload.opportunities.map((item) => `- ${item}`),
    "\n### Required Keywords",
    ...payload.keywords.map((item) => `- ${item}`),
    "\n### Decision Maker Personas",
    ...payload.personas.map((item) => `- ${item}`),
  ].join("\n").trim();
}

function formatCandidateInsights(payload: CandidateInsightsPayload): string {
  return [
    "### Quantified Wins",
    ...payload.quantifiedWins.map((item) => `- ${item}`),
    "\n### WIIFT Angles",
    ...payload.wiiftAngles.map((item) => `- ${item}`),
  ].join("\n").trim();
}

function formatContactIntel(payload: ContactIntelPayload): string {
  return [
    "## Background",
    payload.background,
    "\n## Current Focus",
    payload.currentFocus,
    "\n## Hook",
    payload.hook,
  ].join("\n\n").trim();
}

export type ResearchBriefInput = {
  jobDescription: string;
  companyName: string;
  jobTitle: string;
  originalCV: string;
  extensiveCV: string;
};

export type ResearchBrief = {
  roleInsights: string;
  candidateInsights: string;
};

export async function buildResearchBrief(input: ResearchBriefInput): Promise<ResearchBrief> {
  const reconDoc = await loadReconDocument();
  await ensureStaticDocuments([reconDoc]);

  const jobDoc = buildJobDocument(input.jobDescription, input.companyName, input.jobTitle);
  const candidateDoc = buildCandidateDocument(input.originalCV, input.extensiveCV);

  const staticDocs = [reconDoc];
  const transientDocs = [jobDoc, candidateDoc];

  const rolePrompt = renderPrompt("llamaRoleInsights", {
    companyName: input.companyName,
    jobTitle: input.jobTitle,
  });
  const candidatePrompt = renderPrompt("llamaCandidateInsights", {
    companyName: input.companyName,
    jobTitle: input.jobTitle,
  });

  const [roleRaw, candidateRaw] = await Promise.all([
    queryDocuments({
      prompt: rolePrompt,
      staticDocs,
      transientDocs,
      cacheKeyHint: `role-${input.companyName}-${input.jobTitle}`,
    }),
    queryDocuments({
      prompt: candidatePrompt,
      staticDocs,
      transientDocs,
      cacheKeyHint: `candidate-${input.companyName}-${input.jobTitle}`,
    }),
  ]);

  const roleStructured = parseStructuredResponse(roleRaw, RoleInsightsSchema, "roleInsights");
  const candidateStructured = parseStructuredResponse(candidateRaw, CandidateInsightsSchema, "candidateInsights");

  const roleInsights = roleStructured ? formatRoleInsights(roleStructured) : roleRaw;
  const candidateInsights = candidateStructured ? formatCandidateInsights(candidateStructured) : candidateRaw;

  return { roleInsights, candidateInsights };
}

export type ContactIntelInput = {
  contactName?: string;
  contactTitle?: string;
  companyName: string;
  companyProfile?: string;
  email?: string | null;
  linkedinUrl?: string | null;
};

async function fetchPublicProfileSnapshot(url?: string | null): Promise<string | null> {
  if (!url) {
    return null;
  }
  const normalized = url.startsWith("http") ? url : `https://${url}`;
  const proxied = normalized.startsWith("https://r.jina.ai/") ? normalized : `https://r.jina.ai/${normalized}`;
  try {
    const response = await fetch(proxied, {
      headers: { "User-Agent": "cv-customiser/1.0" },
      cache: "no-store",
    });
    if (!response.ok) {
      logger.warn("Contact profile fetch failed", { status: response.status, url: normalized });
      return null;
    }
    const text = await response.text();
    return truncateText(text, 15000);
  } catch (error) {
    logger.warn("Contact profile fetch error", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function buildContactIntelSummary(input: ContactIntelInput): Promise<string | null> {
  if (!input.contactName) {
    return null;
  }

  const baseProfile = [
    `Name: ${input.contactName}`,
    input.contactTitle ? `Title: ${input.contactTitle}` : null,
    `Company: ${input.companyName}`,
    input.companyProfile ? `Company Profile: ${input.companyProfile}` : null,
    input.email ? `Email: ${input.email}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const profileSnapshot = await fetchPublicProfileSnapshot(input.linkedinUrl ?? null);
  const docs = buildContactDocuments(baseProfile, profileSnapshot);

  const prompt = renderPrompt("llamaContactIntel", {
    contactName: input.contactName,
    contactTitle: input.contactTitle ?? "",
    companyName: input.companyName,
  });

  const response = await queryDocuments({
    prompt,
    staticDocs: [],
    transientDocs: docs,
    cacheKeyHint: `contact-${input.contactName}-${input.companyName}`,
  });

  const structured = parseStructuredResponse(response, ContactIntelSchema, "contactIntel");
  return structured ? formatContactIntel(structured) : response;
}
