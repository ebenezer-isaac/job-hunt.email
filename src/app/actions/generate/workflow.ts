import { createDebugLogger } from "@/lib/debug-logger";
import { getActiveRequestId } from "@/lib/logging/request-id-context";

import { maybeGenerateColdEmailArtifact } from "./workflow/cold-email";
import { maybeGenerateCoverLetterArtifact } from "./workflow/cover-letter";
import { generateCvAndSummary } from "./workflow/cv";
import { enrichContactData, includePrimaryContactEmail, maybeBuildContactIntelSummary } from "./workflow/contact-intel";
import { assertNotAborted } from "./workflow/errors";
import { buildArtifactsPayload } from "./workflow/payloads";
import { synthesizeResearchBrief } from "./workflow/research";
import type { WorkflowParams, WorkflowResult, ModelRetryNotifier } from "./workflow/types";
import type { StoredArtifact } from "./storage";

export { RequestAbortedError } from "./workflow/errors";

const actionLogger = createDebugLogger("generate-action");

export async function runGenerationWorkflow({ parsed, userId, userDisplayName, emit, signal, log }: WorkflowParams): Promise<WorkflowResult> {
  const parsedEmails = parsed.emailAddresses
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  const isColdOutreach = parsed.mode === "cold_outreach";
  const shouldGenerateCoverLetter = !isColdOutreach;
  const shouldGenerateColdEmail = isColdOutreach;
  let overloadRetryNotified = false;
  const modelRetryNotifier: ModelRetryNotifier = (info) => {
    if (!info.overload || overloadRetryNotified) {
      return;
    }
    overloadRetryNotified = true;
    void emit(`Model is overloaded. Retrying in ${Math.round(info.delayMs / 1000)}s...`);
  };
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
  void log?.({ content: "Context confirmed", level: "info" });
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
  void log?.({ content: "Gathered context and contacts", level: "info" });
  await emit("Synthesizing research brief...");
  await emit("Generating tailored CV...");
  void log?.({ content: "Started research and CV generation", level: "info" });
  const researchBrief = await synthesizeResearchBrief({ parsed, emit, signal, logger: actionLogger });
  void log?.({ content: "Research brief ready", level: "info" });

  const {
    cvPersistence,
    changeSummary,
    status: cvStatus,
    message: cvMessage,
    errorLog: cvErrorLog,
    errorLineNumbers: cvErrorLineNumbers,
    errors: cvErrors,
  } = await generateCvAndSummary({
    parsed,
    userDisplayName,
    researchBrief,
    emit,
    signal,
    modelRetryNotifier,
    logger: actionLogger,
  });
  const cvLogContent = cvStatus === "success"
    ? "CV generated"
    : cvMessage ?? "CV LaTeX PDF compilation error";
  void log?.({ content: cvLogContent, level: cvStatus === "success" ? "success" : "warning" });

  assertNotAborted(signal);
  await enrichContactData(parsed, emit);
  void log?.({ content: "Enriched contact data", level: "info" });
  includePrimaryContactEmail(parsed, parsedEmails);
  const contactIntelSummary = await maybeBuildContactIntelSummary({
    parsed,
    emit,
    signal,
    logger: actionLogger,
    shouldGenerateColdEmail,
  });

  let coverLetterArtifact: StoredArtifact | null = null;
  if (shouldGenerateCoverLetter) {
    void log?.({ content: "Generating cover letter", level: "info" });
    coverLetterArtifact = await maybeGenerateCoverLetterArtifact({
      parsed,
      userId,
      researchBrief,
      cvPersistence,
      emit,
      signal,
      modelRetryNotifier,
    });
    void log?.({ content: "Cover letter generated", level: "success" });
  } else {
    await emit("Skipping cover letter for cold outreach mode.");
    void log?.({ content: "Cover letter skipped", level: "info" });
  }

  let coldEmailArtifact: StoredArtifact | null = null;
  if (shouldGenerateColdEmail) {
    void log?.({ content: "Generating cold email", level: "info" });
    coldEmailArtifact = await maybeGenerateColdEmailArtifact({
      parsed,
      userId,
      researchBrief,
      contactIntelSummary,
      cvPersistence,
      parsedEmails,
      emit,
      signal,
      modelRetryNotifier,
    });
    void log?.({ content: "Cold email generated", level: "success" });
  } else {
    await emit("Skipping cold email for standard mode.");
    void log?.({ content: "Cold email skipped", level: "info" });
  }

  assertNotAborted(signal);
  await emit("Saving artifacts to secure storage...");
  void log?.({ content: "Building artifacts payload", level: "info" });
  const { artifactsPayload, generatedFiles, cvArtifact } = buildArtifactsPayload({
    parsed,
    cvPersistence,
    changeSummary,
    coverLetterArtifact,
    coldEmailArtifact,
    userDisplayName,
    cvStatus,
    cvMessage,
    cvErrorLog,
    cvErrorLineNumbers,
    cvErrors,
  });

  assertNotAborted(signal);
  await emit(JSON.stringify(artifactsPayload));
  void log?.({ content: "Artifacts stored and generation completed", level: "success" });
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
