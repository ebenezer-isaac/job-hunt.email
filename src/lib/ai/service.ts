import "server-only";

import { createDebugLogger } from "@/lib/debug-logger";

import { ModelClient, type RetryHandler } from "./model-client";
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
  private readonly jobs = createJobIngestionTasks(this.client);
  private readonly outreach = createOutreachTasks(this.client);
  private readonly research = createResearchTasks(this.client);

  extractJobDescription(rawContent: string) {
    return this.jobs.extractJobDescription(rawContent);
  }

  extractJobDetails(jobDescription: string) {
    return this.jobs.extractJobDetails(jobDescription);
  }

  extractEmailAddresses(jobDescription: string) {
    return this.jobs.extractEmailAddresses(jobDescription);
  }

  generateCVAdvanced(input: GenerateCVAdvancedInput, options?: { onRetry?: RetryHandler }) {
    return this.documents.generateCVAdvanced(input, options);
  }

  fixCVPageCount(input: FixCVPageCountInput, options?: { onRetry?: RetryHandler }) {
    return this.documents.fixCVPageCount(input, options);
  }

  generateCoverLetterAdvanced(input: GenerateCoverLetterInput, options?: { onRetry?: RetryHandler }) {
    return this.documents.generateCoverLetter(input, options);
  }

  refineContentAdvanced(input: RefineContentInput, options?: { onRetry?: RetryHandler }) {
    return this.documents.refineContent(input, options);
  }

  generateCVChangeSummary(originalCV: string, newCV: string, options?: { onRetry?: RetryHandler }) {
    return this.documents.summarizeCvChanges(originalCV, newCV, options);
  }

  generatePersonalizedColdEmail(input: PersonalizedColdEmailInput, options?: { onRetry?: RetryHandler }) {
    return this.outreach.generatePersonalizedColdEmail(input, options);
  }

  generateGenericColdEmail(input: GenericColdEmailInput, options?: { onRetry?: RetryHandler }) {
    return this.outreach.generateGenericColdEmail(input, options);
  }

  async parseColdOutreachInput(userInput: string, options?: { onRetry?: RetryHandler }) {
    this.logger.step("Parsing cold outreach input", { inputLength: userInput.length });
    try {
      const result = await this.outreach.parseColdOutreachInput(userInput, options);
      this.logger.step("Parsed cold outreach input", result);
      return result;
    } catch (error) {
      this.logger.warn("Failed to parse cold outreach input", { error: error instanceof Error ? error.message : String(error) });
      return { companyName: userInput, domainName: null, targetPerson: null, roleContext: null };
    }
  }

  processJobURL(url: string, options?: { onRetry?: RetryHandler }) {
    return this.jobs.processJobURL(url, options);
  }

  processJobText(jobText: string, options?: { onRetry?: RetryHandler }) {
    return this.jobs.processJobText(jobText, options);
  }

  researchCompanyAndIdentifyPeople(input: ResearchCompanyInput) {
    return this.research.researchCompany(input);
  }

  getIntelligence(personName: string, companyName: string) {
    return this.research.getIntelligence(personName, companyName);
  }
}

export const aiService = new AIService();
