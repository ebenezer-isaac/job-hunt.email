import type { ResearchBriefContext } from "./context";

export type GenerateCVAdvancedInput = {
  jobDescription: string;
  originalCV: string;
  extensiveCV: string;
  cvStrategy: string;
  companyName: string;
  jobTitle: string;
  researchBrief?: ResearchBriefContext;
};

export type FixCVPageCountInput = {
  failedCV: string;
  actualPageCount: number;
  targetPageCount?: number;
  jobDescription: string;
};

export type GenerateCoverLetterInput = {
  jobDescription: string;
  companyName: string;
  jobTitle: string;
  validatedCVText: string;
  extensiveCV: string;
  coverLetterStrategy: string;
  currentDate?: string;
  researchBrief?: ResearchBriefContext;
};

export type RefineContentInput = {
  content: string;
  feedback: string;
  chatHistory?: unknown[];
};

export type PersonalizedColdEmailInput = {
  companyName: string;
  companyProfile: string;
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  validatedCVText: string;
  extensiveCV: string;
  coldEmailStrategy: string;
  researchBrief?: ResearchBriefContext;
  contactIntelSummary?: string;
};

export type GenericColdEmailInput = {
  companyName: string;
  companyProfile: string;
  genericEmail: string;
  validatedCVText: string;
  extensiveCV: string;
  coldEmailStrategy: string;
  researchBrief?: ResearchBriefContext;
  contactIntelSummary?: string;
};

export type ResearchCompanyInput = {
  companyName: string;
  originalCV: string;
  reconStrategy: string;
  roleContext?: string | null;
};
