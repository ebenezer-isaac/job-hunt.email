export type ResearchBriefContext = {
  roleInsights?: string;
  candidateInsights?: string;
};

export type ResolvedResearchBrief = {
  roleInsights: string;
  candidateInsights: string;
};

const RESEARCH_FALLBACK: ResolvedResearchBrief = {
  roleInsights: "Research brief unavailable.",
  candidateInsights: "Research brief unavailable.",
};

export function resolveResearchBrief(researchBrief?: ResearchBriefContext): ResolvedResearchBrief {
  if (!researchBrief) {
    return RESEARCH_FALLBACK;
  }
  const roleInsights = researchBrief.roleInsights?.trim() || RESEARCH_FALLBACK.roleInsights;
  const candidateInsights = researchBrief.candidateInsights?.trim() || RESEARCH_FALLBACK.candidateInsights;
  return { roleInsights, candidateInsights };
}

const CONTACT_INTEL_FALLBACK = "Contact intelligence unavailable.";

export function resolveContactIntel(summary?: string): string {
  return summary?.trim() || CONTACT_INTEL_FALLBACK;
}
