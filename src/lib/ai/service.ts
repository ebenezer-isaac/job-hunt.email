import "server-only";

import { createDebugLogger } from "@/lib/debug-logger";

import { ModelClient } from "./model-client";
import { createDocumentTasks } from "./tasks/document-tasks";
import { createJobIngestionTasks } from "./tasks/job-ingestion-tasks";
import { createOutreachTasks } from "./tasks/outreach-tasks";
import { createResearchTasks } from "./tasks/research-tasks";
import type {
  FixCVPageCountInput,
  GenerateCVAdvancedInput,
  GenerateCoverLetterInput,
  GenericColdEmailInput,
  PersonalizedColdEmailInput,
  RefineContentInput,
  ResearchCompanyInput,
} from "./service-types";
export { MODEL_TYPES, type ModelType } from "./model-client";

const aiLogger = createDebugLogger("ai-service");
aiLogger.step("Initializing AI service module");

export class AIService {
  private readonly logger = createDebugLogger("ai-service-instance");
  private readonly client = new ModelClient();
  private readonly documents = createDocumentTasks(this.client);
  private readonly jobs = createJobIngestionTasks(this.client, this.logger);
  private readonly outreach = createOutreachTasks(this.client);
  private readonly research = createResearchTasks(this.client, this.logger);

  extractJobDescription(rawContent: string) {
    return this.jobs.extractJobDescription(rawContent);
  }

  extractJobDetails(jobDescription: string) {
    return this.jobs.extractJobDetails(jobDescription);
  }

  extractEmailAddresses(jobDescription: string) {
    return this.jobs.extractEmailAddresses(jobDescription);
  }

  generateCVAdvanced(input: GenerateCVAdvancedInput) {
    return this.documents.generateCVAdvanced(input);
  }

  fixCVPageCount(input: FixCVPageCountInput) {
    return this.documents.fixCVPageCount(input);
  }

  generateCoverLetterAdvanced(input: GenerateCoverLetterInput) {
    return this.documents.generateCoverLetter(input);
  }

  refineContentAdvanced(input: RefineContentInput) {
    return this.documents.refineContent(input);
  }

  generateCVChangeSummary(originalCV: string, newCV: string) {
    return this.documents.summarizeCvChanges(originalCV, newCV);
  }

  generatePersonalizedColdEmail(input: PersonalizedColdEmailInput) {
    return this.outreach.generatePersonalizedColdEmail(input);
  }

  generateGenericColdEmail(input: GenericColdEmailInput) {
    return this.outreach.generateGenericColdEmail(input);
  }

  async parseColdOutreachInput(userInput: string) {
    try {
      const result = await this.outreach.parseColdOutreachInput(userInput);
      this.logger.step("Parsed cold outreach input", result);
      return result;
    } catch (error) {
      this.logger.warn("Failed to parse cold outreach input", { error: error instanceof Error ? error.message : String(error) });
      return { companyName: userInput, domainName: null, targetPerson: null, roleContext: null };
    }
  }

  processJobURL(url: string) {
    return this.jobs.processJobURL(url);
  }

  processJobText(jobText: string) {
    return this.jobs.processJobText(jobText);
  }

  researchCompanyAndIdentifyPeople(input: ResearchCompanyInput) {
    return this.research.researchCompany(input);
  }

  getIntelligence(personName: string, companyName: string) {
    return this.research.getIntelligence(personName, companyName);
  }
}

export const aiService = new AIService();
