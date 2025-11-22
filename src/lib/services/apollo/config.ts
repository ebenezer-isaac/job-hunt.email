export const BASE_URL = "https://api.apollo.io/v1";

export const SENIORITY_LEVELS = ["owner", "founder", "c_suite", "partner", "vp", "head", "director"] as const;

export const TARGET_ACQUISITION_CONFIG = {
  MAX_SEARCH_PAGES: 1,
  RESULTS_PER_PAGE: 25,
  SPAM_KEYWORDS: ["test", "sample", "demo", "fake", "example"],
  FALLBACK_JOB_TITLES: ["CEO", "CTO", "VP of Engineering", "Engineering Manager", "Head of Engineering"],
} as const;

export const SCORING = {
  EXACT_NAME_MATCH: 200,
  EXACT_COMPANY_MATCH: 300,
  KEYWORD_COMPANY_MATCH: 50,
  JOB_TITLE_MATCH: 30,
  VERIFIED_EMAIL: 20,
  GUESSED_EMAIL: 10,
  SPAM_PENALTY_PER_INDICATOR: 1000,
} as const;

export const HIGH_CONFIDENCE_SCORE_THRESHOLD = SCORING.EXACT_NAME_MATCH + SCORING.KEYWORD_COMPANY_MATCH;
