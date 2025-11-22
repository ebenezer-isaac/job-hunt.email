import { aiService } from "@/lib/ai/service";
import type { GenerationArtifacts } from "@/hooks/useStreamableValue";
import { createDebugLogger } from "@/lib/debug-logger";
import type { ResearchBrief } from "@/lib/ai/llama/context-engine";
import { buildContactIntelSummary, buildResearchBrief } from "@/lib/ai/llama/context-engine";
import { getActiveRequestId } from "@/lib/logging/request-id-context";

import type { ParsedForm } from "./form";
import { buildColdEmail, maybeEnrichContactWithApollo, parseColdEmailStructure } from "./cold-email";
import type { StoredArtifact } from "./storage";
import { persistCvArtifact, saveTextArtifact } from "./storage";

const actionLogger = createDebugLogger("generate-action");

export type WorkflowResult = {
  artifactsPayload: GenerationArtifacts;
  generatedFiles: Record<string, StoredArtifact["generatedFile"]>;
  cvArtifact: StoredArtifact;
  coverLetterArtifact: StoredArtifact | null;
  coldEmailArtifact: StoredArtifact | null;
  parsedEmails: string[];
  researchBrief: ResearchBrief | null;
};

export type WorkflowParams = {
  parsed: ParsedForm;
  userId: string;
  emit: (message: string) => Promise<void>;
  signal?: AbortSignal;
};

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("Generation cancelled");
  }
}

export async function runGenerationWorkflow({ parsed, userId, emit, signal }: WorkflowParams): Promise<WorkflowResult> {
  const parsedEmails = parsed.emailAddresses
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  const isColdOutreach = parsed.mode === "cold_outreach";
  const shouldGenerateCoverLetter = !isColdOutreach;
  const shouldGenerateColdEmail = isColdOutreach;
  let researchBrief: ResearchBrief | null = null;
  let changeSummary: string | null = null;
  const activeRequestId = getActiveRequestId();
  if (activeRequestId) {
    actionLogger.step("Workflow detected active request context", {
      requestId: activeRequestId,
      sessionId: parsed.sessionId,
    });
  } else {
    actionLogger.warn("Workflow executing without active request context", {
      sessionId: parsed.sessionId,
    });
  }

  actionLogger.step("Starting AI generation flow", {
    sessionId: parsed.sessionId,
    userId,
    companyName: parsed.companyName,
    jobTitle: parsed.jobTitle,
    jobSourceUrl: parsed.jobSourceUrl || null,
    companyWebsite: parsed.companyWebsite || null,
    contactName: parsed.contactName || null,
    contactEmail: parsed.contactEmail || null,
  });
  actionLogger.data("request-metadata", {
    strategies: {
      cv: parsed.cvStrategy,
      coverLetter: parsed.coverLetterStrategy,
      coldEmail: parsed.coldEmailStrategy,
    },
    emailTargets: parsedEmails,
  });

  assertNotAborted(signal);
  await emit(`Context confirmed → ${parsed.companyName} • ${parsed.jobTitle}`);
  if (parsed.companyWebsite) {
    await emit(`Company website: ${parsed.companyWebsite}`);
  }
  if (parsed.jobSourceUrl && parsed.jobSourceUrl !== parsed.companyWebsite) {
    await emit(`Job source: ${parsed.jobSourceUrl}`);
  }
  if (parsed.contactName || parsed.contactEmail) {
    const nameSegment = parsed.contactName
      ? `${parsed.contactName}${parsed.contactTitle ? ` (${parsed.contactTitle})` : ""}`
      : null;
    const parts = [nameSegment, parsed.contactEmail].filter((value): value is string => Boolean(value));
    const contactLine = parts.length ? parts.join(" • ") : "Unavailable";
    await emit(`Primary contact: ${contactLine}`);
  } else {
    await emit("Primary contact: not provided");
  }
  await emit(
    parsedEmails.length
      ? `Detected contact emails: ${parsedEmails.join(", ")}`
      : "No validated contact emails detected — using fallback addresses.",
  );
  await emit("Generating tailored CV...");
  try {
    assertNotAborted(signal);
    await emit("Synthesizing research brief with LlamaIndex...");
    researchBrief = await buildResearchBrief({
      jobDescription: parsed.jobDescription,
      originalCV: parsed.originalCV,
      extensiveCV: parsed.extensiveCV,
      companyName: parsed.companyName,
      jobTitle: parsed.jobTitle,
    });
    if (researchBrief) {
      actionLogger.data("research-brief-metadata", {
        roleInsightsLength: researchBrief.roleInsights?.length ?? 0,
        candidateInsightsLength: researchBrief.candidateInsights?.length ?? 0,
      });
    }
    await emit("Research brief ready — weaving insights into documents.");
  } catch (researchError) {
    const reason = researchError instanceof Error ? researchError.message : String(researchError);
    actionLogger.warn("Failed to build research brief", { sessionId: parsed.sessionId, error: reason });
    await emit(`Research brief unavailable: ${reason}`);
  }

  assertNotAborted(signal);
  const cvResponse = await aiService.generateCVAdvanced({
    jobDescription: parsed.jobDescription,
    originalCV: parsed.originalCV,
    extensiveCV: parsed.extensiveCV,
    cvStrategy: parsed.cvStrategy,
    companyName: parsed.companyName,
    jobTitle: parsed.jobTitle,
    researchBrief: researchBrief ?? undefined,
  });
  const cvPersistence = await persistCvArtifact(cvResponse, parsed, userId);
  await emit("CV PDF compiled successfully.");

  try {
    assertNotAborted(signal);
    await emit("Comparing tailored CV against your original resume...");
    changeSummary = await aiService.generateCVChangeSummary(parsed.originalCV, cvPersistence.cv);
    await emit("CV change summary ready.");
  } catch (summaryError) {
    const reason = summaryError instanceof Error ? summaryError.message : String(summaryError);
    actionLogger.warn("Failed to generate CV change summary", { sessionId: parsed.sessionId, error: reason });
    await emit(`Change summary unavailable: ${reason}`);
  }

  assertNotAborted(signal);
  await maybeEnrichContactWithApollo(parsed, emit);
  if (parsed.contactEmail && !parsedEmails.includes(parsed.contactEmail)) {
    parsedEmails.unshift(parsed.contactEmail);
  }

  let contactIntelSummary: string | null = null;
  if (shouldGenerateColdEmail && (parsed.contactName || parsed.contactEmail)) {
    try {
      assertNotAborted(signal);
      await emit("Building contact intelligence dossier...");
      const linkedinUrl = parsed.jobSourceUrl && parsed.jobSourceUrl.toLowerCase().includes("linkedin.com")
        ? parsed.jobSourceUrl
        : undefined;
      contactIntelSummary = await buildContactIntelSummary({
        contactName: parsed.contactName || undefined,
        contactTitle: parsed.contactTitle || undefined,
        companyName: parsed.companyName,
        companyProfile: parsed.companyProfile || undefined,
        email: parsed.contactEmail || undefined,
        linkedinUrl,
      });
      if (contactIntelSummary) {
        actionLogger.data("contact-intel-metadata", {
          length: contactIntelSummary.length,
        });
        await emit("Contact intel ready — personalizing outreach.");
      } else {
        await emit("Contact intel skipped: insufficient data.");
      }
    } catch (contactError) {
      const reason = contactError instanceof Error ? contactError.message : String(contactError);
      actionLogger.warn("Failed to build contact intel", { sessionId: parsed.sessionId, error: reason });
      await emit(`Contact intel unavailable: ${reason}`);
    }
  }

  let coverLetterArtifact: StoredArtifact | null = null;
  if (shouldGenerateCoverLetter) {
    assertNotAborted(signal);
    await emit("Drafting cover letter...");
    const coverLetterResponse = await aiService.generateCoverLetterAdvanced({
      jobDescription: parsed.jobDescription,
      companyName: parsed.companyName,
      jobTitle: parsed.jobTitle,
      validatedCVText: parsed.validatedCVText || cvPersistence.cv,
      extensiveCV: parsed.extensiveCV,
      coverLetterStrategy: parsed.coverLetterStrategy,
      researchBrief: researchBrief ?? undefined,
    });
    coverLetterArtifact = await saveTextArtifact(
      coverLetterResponse,
      parsed,
      userId,
      "cover-letter.doc",
      "cover-letter",
      "Cover Letter (DOC)",
      "application/msword",
    );
    await emit("Cover letter saved to storage.");
  } else {
    await emit("Skipping cover letter for cold outreach mode.");
  }

  let coldEmailArtifact: StoredArtifact | null = null;
  if (shouldGenerateColdEmail) {
    assertNotAborted(signal);
    await emit("Preparing cold email...");
    const coldEmailResponse = await buildColdEmail(
      parsed,
      parsed.validatedCVText || cvPersistence.cv,
      { researchBrief, contactIntelSummary },
    );
    const coldEmailStructure = parseColdEmailStructure(coldEmailResponse);
    const emailTarget = parsed.contactEmail || parsed.genericEmail || parsedEmails[0] || "hello@example.com";
    coldEmailArtifact = await saveTextArtifact(
      coldEmailResponse,
      parsed,
      userId,
      "cold-email.txt",
      "cold-email",
      "Cold Email (TXT)",
    );
    coldEmailArtifact.payload.emailAddresses = parsedEmails;
    coldEmailArtifact.payload.subject = coldEmailStructure.subject;
    coldEmailArtifact.payload.body = coldEmailStructure.body;
    coldEmailArtifact.payload.toAddress = emailTarget;
    await emit(`Cold email ready for ${emailTarget}.`);
  } else {
    await emit("Skipping cold email for standard mode.");
  }

  assertNotAborted(signal);
  await emit("Saving artifacts to secure storage...");
  const cvFile = cvPersistence.result.file;
  if (!cvFile) {
    throw new Error("CV PDF missing from DocumentService response");
  }

  const cvArtifact: StoredArtifact = {
    payload: {
      content: cvPersistence.cv,
      downloadUrl: cvFile.url,
      storageKey: cvFile.key,
      mimeType: "application/pdf",
      pageCount: cvPersistence.result.pageCount,
      changeSummary: changeSummary ?? undefined,
    },
    generatedFile: {
      key: cvFile.key,
      url: cvFile.url,
      label: "Tailored CV (PDF)",
      mimeType: "application/pdf",
    },
  };

  const artifactsPayload: GenerationArtifacts = { cv: cvArtifact.payload };
  const generatedFiles: Record<string, StoredArtifact["generatedFile"]> = { cv: cvArtifact.generatedFile };

  if (coverLetterArtifact) {
    artifactsPayload.coverLetter = coverLetterArtifact.payload;
    generatedFiles.coverLetter = coverLetterArtifact.generatedFile;
  }
  if (coldEmailArtifact) {
    artifactsPayload.coldEmail = coldEmailArtifact.payload;
    generatedFiles.coldEmail = coldEmailArtifact.generatedFile;
  }

  assertNotAborted(signal);
  await emit(JSON.stringify(artifactsPayload));
  return {
    artifactsPayload,
    generatedFiles,
    cvArtifact,
    coverLetterArtifact,
    coldEmailArtifact,
    parsedEmails,
    researchBrief,
  };
}
