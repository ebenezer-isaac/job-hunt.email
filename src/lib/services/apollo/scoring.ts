import { ApolloCandidate } from "./types";
import { SCORING, TARGET_ACQUISITION_CONFIG } from "./config";

export function sanitize(value?: string): string {
  return value?.toLowerCase().trim() ?? "";
}

export function calculateSpamScore(candidate: ApolloCandidate): number {
  let spamIndicators = 0;
  const title = sanitize(candidate.title);
  const company = sanitize(candidate.organization?.name);
  const email = sanitize(candidate.email);
  const name = sanitize(candidate.name);
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

export function buildTitleRegex(jobTitles: string[]): RegExp | null {
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

export function scoreCandidate(
  candidate: ApolloCandidate,
  companyName: string,
  likelyJobTitles: string[],
  targetPersonName?: string,
): number {
  let score = 0;

  if (targetPersonName) {
    const candidateName = sanitize(candidate.name);
    const targetName = sanitize(targetPersonName);
    if (candidateName && candidateName === targetName) {
      score += SCORING.EXACT_NAME_MATCH;
    }
  }

  const candidateCompany = sanitize(candidate.organization?.name);
  const targetCompany = sanitize(companyName);
  if (candidateCompany && targetCompany) {
    if (candidateCompany === targetCompany) {
      score += SCORING.EXACT_COMPANY_MATCH;
    } else if (candidateCompany.includes(targetCompany) || targetCompany.includes(candidateCompany)) {
      score += SCORING.KEYWORD_COMPANY_MATCH;
    }
  }

  const titleRegex = buildTitleRegex(likelyJobTitles);
  if (titleRegex && candidate.title && titleRegex.test(candidate.title)) {
    score += SCORING.JOB_TITLE_MATCH;
  }

  const emailStatus = candidate.email_status ?? candidate.emailStatus;
  if (emailStatus === "verified") {
    score += SCORING.VERIFIED_EMAIL;
  } else if (emailStatus === "guessed" || emailStatus === "likely") {
    score += SCORING.GUESSED_EMAIL;
  }

  const spamScore = calculateSpamScore(candidate);
  if (spamScore > 0) {
      score -= spamScore * SCORING.SPAM_PENALTY_PER_INDICATOR;
  }

  return score;
}
