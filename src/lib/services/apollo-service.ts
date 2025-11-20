import "server-only";

import { env } from "@/env";
import { aiService, type AIService } from "@/lib/ai/service";
import { createDebugLogger } from "@/lib/debug-logger";
import { disambiguationService, type EmailStatus } from "@/lib/services/disambiguation-service";

const BASE_URL = "https://api.apollo.io/v1";

const SENIORITY_LEVELS = ["owner", "founder", "c_suite", "partner", "vp", "head", "director"] as const;

const TARGET_ACQUISITION_CONFIG = {
  MAX_SEARCH_PAGES: 1,
  RESULTS_PER_PAGE: 25,
  SPAM_KEYWORDS: ["test", "sample", "demo", "fake", "example"],
  FALLBACK_JOB_TITLES: ["CEO", "CTO", "VP of Engineering", "Engineering Manager", "Head of Engineering"],
} as const;

const SCORING = {
  EXACT_NAME_MATCH: 200,
  EXACT_COMPANY_MATCH: 300,
  KEYWORD_COMPANY_MATCH: 50,
  JOB_TITLE_MATCH: 30,
  VERIFIED_EMAIL: 20,
  GUESSED_EMAIL: 10,
  SPAM_PENALTY_PER_INDICATOR: 1000,
} as const;

const HIGH_CONFIDENCE_SCORE_THRESHOLD = SCORING.EXACT_NAME_MATCH + SCORING.KEYWORD_COMPANY_MATCH;

type LogLevel = "info" | "warning" | "error" | "success";

type Organization = {
  id?: string;
  name?: string;
  domain?: string;
  estimated_num_employees?: number;
};

type ApolloCandidate = {
  id?: string;
  name?: string;
  title?: string;
  email?: string;
  email_status?: string;
  emailStatus?: string;
  seniority?: string;
  linkedin_url?: string;
  linkedinUrl?: string;
  organization?: Organization;
};

type SearchResponse = {
  people?: ApolloCandidate[];
  contacts?: ApolloCandidate[];
};

type MixedCompanyResponse = {
  organizations?: Organization[];
};

type EnrichResponse = {
  person?: ApolloCandidate | null;
};

type FindContactParams = {
  personName: string;
  companyName: string;
  companyDomain: string;
  logCallback?: (message: string, level?: LogLevel) => void;
};

const httpLogger = createDebugLogger("apollo-http");

async function fetchJson<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": env.APOLLO_API_KEY,
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      httpLogger.error("Apollo API request failed", { path, status: response.status, body });
      throw new Error(`Apollo API responded with ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

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
        score: this.scoreCandidate(candidate, companyName, likelyJobTitles, personName),
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
        score: this.scoreCandidate(candidate, companyName, likelyJobTitles, personName),
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

  private sanitize(value?: string): string {
    return value?.toLowerCase().trim() ?? "";
  }

  private calculateSpamScore(candidate: ApolloCandidate): number {
    let spamIndicators = 0;
    const title = this.sanitize(candidate.title);
    const company = this.sanitize(candidate.organization?.name);
    const email = this.sanitize(candidate.email);
    const name = this.sanitize(candidate.name);
    const employeeCount = candidate.organization?.estimated_num_employees;

    if (title && company && title === company && title.length > 5) {
      spamIndicators += 1;
    }
    if (employeeCount === 0) {
      spamIndicators += 1;
    }
    for (const keyword of TARGET_ACQUISITION_CONFIG.SPAM_KEYWORDS) {
      if (name.includes(keyword)) {
        spamIndicators += 1;
      }
    }
    if (email.includes("noreply") || email.includes("no-reply")) {
      spamIndicators += 1;
    }
    if (!candidate.name || !candidate.title || !candidate.organization?.name) {
      spamIndicators += 1;
    }

    return spamIndicators;
  }

  private buildTitleRegex(jobTitles: string[]): RegExp | null {
    if (!jobTitles.length) {
      return null;
    }
    const escapedTitles = jobTitles.map((title) =>
      title
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\s+/g, "\\s+"),
    );
    const pattern = `(^|,\\s*|;\\s*|\\s+and\\s+|&\\s+)(${escapedTitles.join("|")})(?=\\s|$|,|;|\\s+and\\s|&)`;
    return new RegExp(pattern, "i");
  }

  private scoreCandidate(
    candidate: ApolloCandidate,
    companyName: string,
    likelyJobTitles: string[],
    targetPersonName?: string,
  ): number {
    let score = 0;

    if (targetPersonName) {
      const candidateName = this.sanitize(candidate.name);
      const targetName = this.sanitize(targetPersonName);
      if (candidateName && candidateName === targetName) {
        score += SCORING.EXACT_NAME_MATCH;
      }
    }

    const candidateCompany = this.sanitize(candidate.organization?.name);
    const targetCompany = this.sanitize(companyName);
    if (candidateCompany && targetCompany) {
      if (candidateCompany === targetCompany) {
        score += SCORING.EXACT_COMPANY_MATCH;
      } else if (candidateCompany.includes(targetCompany) || targetCompany.includes(candidateCompany)) {
        score += SCORING.KEYWORD_COMPANY_MATCH;
      }
    }

    const titleRegex = this.buildTitleRegex(likelyJobTitles);
    if (titleRegex && candidate.title && titleRegex.test(candidate.title)) {
      score += SCORING.JOB_TITLE_MATCH;
    }

    const emailStatus = candidate.email_status ?? candidate.emailStatus;
    if (emailStatus === "verified") {
      score += SCORING.VERIFIED_EMAIL;
    } else if (emailStatus === "guessed" || emailStatus === "likely") {
      score += SCORING.GUESSED_EMAIL;
    }

    const spamScore = this.calculateSpamScore(candidate);
    if (spamScore > 0) {
      score -= spamScore * SCORING.SPAM_PENALTY_PER_INDICATOR;
    }

    return score;
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
