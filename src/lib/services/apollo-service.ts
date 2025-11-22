import "server-only";

import { env } from "@/env";
import { aiService, type AIService } from "@/lib/ai/service";
import { createDebugLogger } from "@/lib/debug-logger";
import { disambiguationService, type EmailStatus } from "@/lib/services/disambiguation-service";
import { fetchJson } from "./apollo/client";
import {
  TARGET_ACQUISITION_CONFIG,
  HIGH_CONFIDENCE_SCORE_THRESHOLD,
  SENIORITY_LEVELS,
} from "./apollo/config";
import { scoreCandidate } from "./apollo/scoring";
import {
  ApolloCandidate,
  EnrichResponse,
  FindContactParams,
  LogLevel,
  MixedCompanyResponse,
  Organization,
  SearchResponse,
} from "./apollo/types";



export class ApolloService {
  private readonly timeout = env.SCRAPING_TIMEOUT;
  private readonly logger = createDebugLogger("apollo-service");

  constructor(private readonly ai: AIService = aiService) {}

  isEnabled(): boolean {
    return Boolean(env.APOLLO_API_KEY);
  }

  async findContact(params: FindContactParams): Promise<ApolloCandidate | null> {
    const { personName, companyName, companyDomain, logCallback } = params;
    const log = (message: string, level: LogLevel = "info") => {
      this.logger.step(message, { level });
      logCallback?.(message, level);
    };

    log(`Starting Target Acquisition for ${personName} at ${companyName}`);

    if (!this.isEnabled()) {
      log("Apollo API key missing", "warning");
      return null;
    }
    if (!companyDomain) {
      log("Company domain is required", "error");
      return null;
    }

    let likelyJobTitles: string[] = [...TARGET_ACQUISITION_CONFIG.FALLBACK_JOB_TITLES];
    if (this.ai) {
      try {
        const titles = await this.ai.getIntelligence(personName, companyName);
        if (titles.length) {
          likelyJobTitles = titles;
        }
        log(`AI identified job titles: ${likelyJobTitles.join(", ")}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`AI intelligence gathering failed: ${message}`, "warning");
      }
    }

    const personCentricCandidates = await this.collectCandidates(
      { personName, companyDomain },
      TARGET_ACQUISITION_CONFIG.MAX_SEARCH_PAGES,
    );

    let highConfidenceMatch: { candidate: ApolloCandidate; score: number } | null = null;
    if (personCentricCandidates.length > 0) {
      log(`Person-centric search found ${personCentricCandidates.length} candidates`);
      const scored = personCentricCandidates.map((candidate) => ({
        candidate,
        score: scoreCandidate(candidate, companyName, likelyJobTitles, personName),
      }));
      scored.sort((a, b) => b.score - a.score);
      const top = scored[0];
      if (top.score >= HIGH_CONFIDENCE_SCORE_THRESHOLD) {
        log(`High-confidence match found (${top.score})`, "success");
        highConfidenceMatch = top;
      } else {
        log(`Top score ${top.score} below threshold`, "warning");
      }
    } else {
      log("Person-centric search returned no candidates", "warning");
    }

    let roleCentricCandidates: ApolloCandidate[] = [];
    if (!highConfidenceMatch) {
      roleCentricCandidates = await this.collectRoleCentricCandidates(
        { companyDomain, likelyJobTitles },
        TARGET_ACQUISITION_CONFIG.MAX_SEARCH_PAGES,
      );
      log(`Role-centric search found ${roleCentricCandidates.length} candidates`);
    }

    const candidatePool = [
      ...(highConfidenceMatch ? [highConfidenceMatch] : []),
      ...roleCentricCandidates.map((candidate) => ({
        candidate,
        score: scoreCandidate(candidate, companyName, likelyJobTitles, personName),
      })),
    ];

    if (candidatePool.length === 0) {
      log("No candidates available after search", "error");
      return null;
    }

    candidatePool.sort((a, b) => b.score - a.score);
    log(`Scored ${candidatePool.length} candidates; top score ${candidatePool[0].score}`);
    const prioritizedCandidates = this.buildPrioritizedCandidates(candidatePool, log);

    for (const [index, candidate] of prioritizedCandidates.entries()) {
      log(
        `Attempting enrichment ${index + 1}/${prioritizedCandidates.length}: ${candidate.name ?? "Unknown"}`,
      );

      if (disambiguationService.isValidContact(this.adaptCandidate(candidate))) {
        log(`Target acquired via existing contact: ${candidate.name} (${candidate.email})`, "success");
        return candidate;
      }

      const enriched = await this.tryEnrichCandidate(candidate, log);
      if (enriched && disambiguationService.isValidContact(this.adaptCandidate(enriched))) {
        log(`Target acquired after enrichment: ${enriched.name} (${enriched.email})`, "success");
        return enriched;
      }
    }

    log("Failed to acquire a contact after enrichment", "error");
    return null;
  }

  private buildPrioritizedCandidates(
    candidatePool: Array<{ candidate: ApolloCandidate; score: number }>,
    log: (message: string, level?: LogLevel) => void,
  ): ApolloCandidate[] {
    const ordered = candidatePool.map((entry) => entry.candidate);
    const adapters = ordered.map((candidate) => ({ candidate, record: this.adaptCandidate(candidate) }));
    const records = adapters.map((entry) => entry.record);
    const withEmails = disambiguationService.filterContactsWithEmails(records);
    const prioritizedRecords = withEmails.length ? withEmails : records;
    const disambiguated = disambiguationService.selectBestContact(prioritizedRecords);

    let disambiguatedCandidate: ApolloCandidate | null = null;
    if (disambiguated) {
      log(`Disambiguation heuristics prioritised ${disambiguated.name ?? "Unknown"}`, "info");
      const found = adapters.find((entry) => entry.record === disambiguated);
      disambiguatedCandidate = found?.candidate ?? null;
    }

    return this.dedupeCandidates([
      ...(disambiguatedCandidate ? [disambiguatedCandidate] : []),
      ...ordered,
    ]);
  }

  private dedupeCandidates(candidates: ApolloCandidate[]): ApolloCandidate[] {
    const seen = new Set<string>();
    const result: ApolloCandidate[] = [];
    for (const candidate of candidates) {
      const key = candidate.id || `${candidate.email ?? ""}|${candidate.name ?? ""}`;
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push(candidate);
      } else if (!key) {
        result.push(candidate);
      }
    }
    return result;
  }

  private adaptCandidate(candidate: ApolloCandidate) {
    return {
      id: candidate.id,
      name: candidate.name,
      title: candidate.title,
      email: candidate.email,
      emailStatus: (candidate.emailStatus ?? candidate.email_status) as EmailStatus | undefined,
      seniority: candidate.seniority,
      linkedinUrl: candidate.linkedinUrl ?? candidate.linkedin_url,
    };
  }

  private async collectCandidates(
    params: { personName: string; companyDomain: string },
    maxPages: number,
  ): Promise<ApolloCandidate[]> {
    const aggregated: ApolloCandidate[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const payload = {
        q_keywords: params.personName,
        q_organization_domains_list: [params.companyDomain],
        page,
        per_page: TARGET_ACQUISITION_CONFIG.RESULTS_PER_PAGE,
      };
      const response = await fetchJson<SearchResponse>("/mixed_people/search", {
        method: "POST",
        body: JSON.stringify(payload),
      }, this.timeout);
      const candidates = [...(response.people ?? []), ...(response.contacts ?? [])];
      if (!candidates.length) {
        break;
      }
      aggregated.push(...candidates);
    }
    return aggregated;
  }

  private async collectRoleCentricCandidates(
    params: { companyDomain: string; likelyJobTitles: string[] },
    maxPages: number,
  ): Promise<ApolloCandidate[]> {
    const aggregated: ApolloCandidate[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const payload = {
        q_organization_domains_list: [params.companyDomain],
        person_titles: params.likelyJobTitles,
        person_seniorities: SENIORITY_LEVELS,
        page,
        per_page: TARGET_ACQUISITION_CONFIG.RESULTS_PER_PAGE,
      };
      const response = await fetchJson<SearchResponse>("/mixed_people/search", {
        method: "POST",
        body: JSON.stringify(payload),
      }, this.timeout);
      const candidates = [...(response.people ?? []), ...(response.contacts ?? [])];
      if (!candidates.length) {
        break;
      }
      aggregated.push(...candidates);
    }
    return aggregated;
  }



  private async tryEnrichCandidate(
    candidate: ApolloCandidate,
    log: (message: string, level?: LogLevel) => void,
  ): Promise<ApolloCandidate | null> {
    if (candidate.email && candidate.email !== "email_not_unlocked@domain.com") {
      return candidate;
    }

    if (!candidate.id) {
      log("Candidate is missing ID; cannot enrich", "warning");
      return null;
    }

    try {
      const enriched = await this.enrichContact(candidate.id);
      if (enriched?.email) {
        return enriched;
      }
      log("Enrichment returned no email", "warning");
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Enrichment failed: ${message}`, "error");
      return null;
    }
  }

  async searchCompany(companyName: string): Promise<Organization | null> {
    this.logger.step("Searching company", { companyName });
    const payload = { q_organization_name: companyName };
    const response = await fetchJson<MixedCompanyResponse>("/mixed_companies/search", {
      method: "POST",
      body: JSON.stringify(payload),
    }, this.timeout);
    const organizations = response.organizations ?? [];
    if (!organizations.length) {
      return null;
    }
    const lower = companyName.toLowerCase();
    const exact = organizations.find((org) => (org.name ?? "").toLowerCase() === lower);
    if (exact) {
      return exact;
    }
    const keywordMatches = organizations
      .filter((org) => (org.name ?? "").toLowerCase().includes(lower))
      .sort((a, b) => (b.estimated_num_employees ?? 0) - (a.estimated_num_employees ?? 0));
    if (keywordMatches.length) {
      return keywordMatches[0];
    }
    return organizations.sort((a, b) => (b.estimated_num_employees ?? 0) - (a.estimated_num_employees ?? 0))[0];
  }

  async fetchEmployeesByOrgId(params: {
    organizationId: string;
    targetTitles?: string[];
    limit?: number;
  }): Promise<ApolloCandidate[]> {
    const payload = {
      organization_ids: [params.organizationId],
      person_titles: params.targetTitles ?? undefined,
      page: 1,
      per_page: params.limit ?? 10,
    };
    const response = await fetchJson<SearchResponse>("/mixed_people/search", {
      method: "POST",
      body: JSON.stringify(payload),
    }, this.timeout);
    return [...(response.people ?? []), ...(response.contacts ?? [])];
  }

  async enrichContact(contactId: string): Promise<ApolloCandidate | null> {
    const cached = await this.getPerson(contactId);
    if (cached?.email) {
      return cached;
    }
    const payload = { id: contactId };
    const response = await fetchJson<EnrichResponse>("/people/enrich", {
      method: "POST",
      body: JSON.stringify(payload),
    }, this.timeout);
    return response.person ?? null;
  }

  async getPerson(personId: string): Promise<ApolloCandidate | null> {
    const query = new URLSearchParams({ id: personId });
    const response = await fetchJson<{ person?: ApolloCandidate | null }>(`/people/match?${query.toString()}`, {
      method: "GET",
    }, this.timeout);
    return response.person ?? null;
  }
}

export const apolloService = new ApolloService();
