'use client';

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { createSessionAction } from "@/app/actions/create-session";
import { processJobInputAction, type NormalizedJobInput } from "@/app/actions/process-job-input";
import { useSessionStore } from "@/store/session-store";
import { useStreamableValue, type GenerationArtifacts } from "@/hooks/useStreamableValue";
import { REQUEST_ID_HEADER, setClientRequestId } from "@/lib/debug-logger";
import { clientEnv } from "@/lib/env-client";

export type ChatInput = {
  jobDescription: string;
  companyName: string;
  jobTitle: string;
  companyWebsite?: string;
  contactName?: string;
  contactTitle?: string;
  contactEmail?: string;
};

export type ChatResult = {
  jobDescription: string;
  companyName: string;
  jobTitle: string;
  jobUrl?: string | null;
  emailAddresses: string[];
  companyWebsite?: string | null;
  contactName?: string | null;
  contactTitle?: string | null;
  contactEmail?: string | null;
};

export function useChat() {
  const sessions = useSessionStore((state) => state.sessions);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const mode = useSessionStore((state) => state.mode);
  const sourceDocuments = useSessionStore((state) => state.sourceDocuments);
  const quota = useSessionStore((state) => state.quota);
  const actions = useSessionStore((state) => state.actions);
  const isGenerating = useSessionStore((state) => state.isGenerating);
  const { consume, reset } = useStreamableValue();
  const activeRequestIdRef = useRef<string | null>(null);

  const ensureSession = useCallback(async (metadata: ChatInput): Promise<string> => {
    if (currentSessionId) {
      return currentSessionId;
    }

    const session = await createSessionAction({
      companyName: metadata.companyName,
      jobTitle: metadata.jobTitle,
      mode,
      companyWebsite: metadata.companyWebsite?.trim() ?? "",
      contactName: metadata.contactName?.trim() ?? "",
      contactTitle: metadata.contactTitle?.trim() ?? "",
      contactEmail: metadata.contactEmail?.trim() ?? "",
    });

    actions.setSessions([session, ...sessions]);
    actions.selectSession(session.id);
    return session.id;
  }, [actions, currentSessionId, mode, sessions]);

  const sendMessage = useCallback(async (input: ChatInput): Promise<ChatResult | null> => {
    const trimmedDescription = input.jobDescription.trim();
    if (!trimmedDescription && mode === "standard") {
      toast.error("Please paste a job description or URL before generating.");
      return null;
    }
    if (!sourceDocuments.originalCV || !sourceDocuments.extensiveCV) {
      toast.error("Please add both Original and Extensive CV content inside Settings before generating.");
      return null;
    }
    if (quota && quota.remaining <= 0) {
      toast.error(`You have no tokens left. Email ${clientEnv.contactEmail} to request more allocation.`);
      return null;
    }

    actions.setIsGenerating(true);
    actions.setGeneratedDocuments(currentSessionId, null);
    reset();

    let sessionId: string | null = null;
    let runRequestId: string | null = null;

    try {
      const shouldProcessJobInput = trimmedDescription.length > 0;
      let normalized: NormalizedJobInput | null = null;
      if (shouldProcessJobInput) {
        normalized = await processJobInputAction({ jobInput: trimmedDescription });
      }

      const preferManualValue = (manual: string, extracted?: string | null) => {
        const trimmedManual = manual.trim();
        if (trimmedManual) {
          return trimmedManual;
        }
        const trimmedExtracted = extracted?.trim();
        if (!trimmedExtracted) {
          return "";
        }
        const genericValues = new Set(["unknown company", "open role", "untitled role", "n/a"]);
        if (genericValues.has(trimmedExtracted.toLowerCase())) {
          return "";
        }
        return trimmedExtracted;
      };

      const resolvedCompanyName = preferManualValue(input.companyName, normalized?.companyName) || input.companyName.trim();
      const resolvedJobTitle = preferManualValue(input.jobTitle, normalized?.jobTitle) || input.jobTitle.trim();
      const resolvedCompanyWebsite = preferManualValue(input.companyWebsite ?? "");
      const contactName = preferManualValue(input.contactName ?? "");
      const contactTitle = preferManualValue(input.contactTitle ?? "");
      const normalizedEmails = normalized?.emailAddresses ?? [];
      const detectedEmail = normalizedEmails[0] ?? "";
      const contactEmail = preferManualValue(input.contactEmail ?? "", detectedEmail);
      const resolvedJobDescription =
        normalized?.jobDescription?.trim() ||
        trimmedDescription ||
        `Cold outreach sequence for ${resolvedCompanyName}`;
      const jobSourceUrl = normalized?.jobUrl?.trim() || resolvedCompanyWebsite || "";
      const genericEmail = detectedEmail || "hello@example.com";
      const companyProfile = normalized?.companyProfile ?? "";

      sessionId = await ensureSession({
        jobDescription: resolvedJobDescription,
        companyName: resolvedCompanyName,
        jobTitle: resolvedJobTitle,
        companyWebsite: resolvedCompanyWebsite,
        contactName,
        contactTitle,
        contactEmail,
      });

      const requestTimestamp = new Date().toISOString();
      actions.touchSessionTimestamp(sessionId, requestTimestamp);
      actions.setSessionStatus(sessionId, "processing");

      const timestamp = requestTimestamp;
      const userContent =
        resolvedJobDescription.trim().length > 0
          ? resolvedJobDescription.trim()
          : buildUserRequestSummary({
              companyName: resolvedCompanyName,
              jobTitle: resolvedJobTitle,
              companyWebsite: resolvedCompanyWebsite,
              contactName,
              contactTitle,
              contactEmail,
            });
      const userMessage = {
          id: createMessageId(sessionId, "user"),
        role: "user" as const,
        content: userContent,
        timestamp,
        isMarkdown: false,
        metadata: { kind: "prompt" },
      };

      actions.appendChatMessage(sessionId, userMessage);

      const summaryParts = [
        normalized?.wasUrl
          ? `Parsed job posting from ${normalized.jobUrl ?? "the provided URL"}.`
          : "Analysed pasted job description.",
        `Company → ${resolvedCompanyName}`,
        `Role → ${resolvedJobTitle}`,
      ];
      if (normalizedEmails.length) {
        summaryParts.push(`Emails detected: ${normalizedEmails.join(", ")}`);
      }
      if (resolvedCompanyWebsite || jobSourceUrl) {
        summaryParts.push(`Website → ${resolvedCompanyWebsite || jobSourceUrl}`);
      }
      if (contactName) {
        summaryParts.push(`Contact → ${contactName}${contactTitle ? ` (${contactTitle})` : ""}`);
      }

        actions.appendChatMessage(sessionId, {
          id: createMessageId(sessionId, "system"),
        role: "system",
        content: summaryParts.join("\n"),
        timestamp: new Date().toISOString(),
        level: "info",
        metadata: { kind: "summary" },
      });

      const formData = new FormData();
      formData.append("sessionId", sessionId);
      formData.append("jobDescription", resolvedJobDescription);
      formData.append("companyName", resolvedCompanyName);
      formData.append("jobTitle", resolvedJobTitle);
      formData.append("companyWebsite", resolvedCompanyWebsite);
      formData.append("mode", mode);
      formData.append("originalCV", sourceDocuments.originalCV);
      formData.append("extensiveCV", sourceDocuments.extensiveCV);
      formData.append(
        "cvStrategy",
        sourceDocuments.cvStrategy || "Emphasize quantified impact and LaTeX layout parity.",
      );
      formData.append(
        "coverLetterStrategy",
        sourceDocuments.coverLetterStrategy || "Concise one-page cover letter.",
      );
      formData.append("coldEmailStrategy", sourceDocuments.coldEmailStrategy || "Short email under 150 words.");
      formData.append("validatedCVText", "");
      formData.append("contactName", contactName);
      formData.append("contactTitle", contactTitle);
      formData.append("contactEmail", contactEmail);
      formData.append("companyProfile", companyProfile);
      formData.append("genericEmail", genericEmail);
      formData.append("jobSourceUrl", jobSourceUrl);
      formData.append("emailAddresses", normalizedEmails.join(","));

      runRequestId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      activeRequestIdRef.current = runRequestId;
      setClientRequestId(runRequestId);

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
        headers: runRequestId ? { [REQUEST_ID_HEADER]: runRequestId } : undefined,
      });

      if (!response.ok || !response.body) {
        throw new Error("Streaming response not available");
      }

      await consume(response.body, {
        onLine(line) {
          if (!sessionId) {
            return;
          }
          actions.appendChatMessage(sessionId, {
            id: createMessageId(sessionId, "assistant"),
            role: "assistant",
            content: line,
            timestamp: new Date().toISOString(),
            level: deriveLevel(line),
            metadata: { kind: "log" },
            mergeDisabled: true,
          });
        },
        onArtifacts(artifacts) {
          if (!sessionId) {
            return;
          }
          actions.setGeneratedDocuments(sessionId, artifacts);
          actions.setSessionStatus(sessionId, "completed");
          actions.appendChatMessage(sessionId, {
            id: createMessageId(sessionId, "summary"),
            role: "assistant",
            content: buildArtifactSummary(artifacts),
            timestamp: new Date().toISOString(),
            level: "success",
            metadata: { kind: "summary" },
          });
          toast.success("Documents generated successfully");
        },
      });

      return {
        jobDescription: resolvedJobDescription,
        companyName: resolvedCompanyName,
        jobTitle: resolvedJobTitle,
        jobUrl: normalized?.jobUrl,
        emailAddresses: normalizedEmails,
        companyWebsite: resolvedCompanyWebsite,
        contactName,
        contactTitle,
        contactEmail,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const targetSessionId = sessionId ?? currentSessionId;
      if (targetSessionId) {
        actions.setSessionStatus(targetSessionId, "failed");
        actions.appendChatMessage(targetSessionId, {
            id: createMessageId(targetSessionId, "error"),
          role: "system",
          content: `Generation failed: ${message}`,
          timestamp: new Date().toISOString(),
          level: "error",
          metadata: { kind: "summary" },
        });
      }
      toast.error(`Generation failed: ${message}`);
      return null;
    } finally {
      if (runRequestId && activeRequestIdRef.current === runRequestId) {
        activeRequestIdRef.current = null;
        setClientRequestId(null);
      }
      actions.setIsGenerating(false);
    }
  }, [actions, consume, currentSessionId, ensureSession, mode, quota, reset, sourceDocuments]);

  return {
    sendMessage,
    isGenerating,
  };
}

function buildArtifactSummary(artifacts: GenerationArtifacts): string {
  const available = Object.entries(artifacts)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => formatArtifactLabel(key));
  if (!available.length) {
    return "Artifacts saved successfully.";
  }
  if (available.length === 1) {
    return `${available[0]} ready.`;
  }
  const last = available.pop();
  return `${available.join(", ")} and ${last} ready.`;
}

function formatArtifactLabel(key: string): string {
  switch (key) {
    case "cv":
      return "CV";
    case "coverLetter":
      return "Cover Letter";
    case "coldEmail":
      return "Cold Email";
    default:
      return key;
  }
}

function deriveLevel(line: string): "info" | "success" | "error" {
  if (line.startsWith("✓") || /success/i.test(line)) {
    return "success";
  }
  if (line.startsWith("✗") || /fail|error/i.test(line)) {
    return "error";
  }
  return "info";
}

function createMessageId(sessionId: string, role: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${sessionId}-${role}-${Date.now()}-${suffix}`;
}

type UserRequestSummaryArgs = {
  companyName: string;
  jobTitle: string;
  companyWebsite?: string;
  contactName?: string;
  contactTitle?: string;
  contactEmail?: string;
};

function buildUserRequestSummary(args: UserRequestSummaryArgs): string {
  const lines = [] as string[];
  const header = [args.companyName, args.jobTitle].filter(Boolean).join(" • ");
  if (header) {
    lines.push(header);
  }
  if (args.companyWebsite) {
    lines.push(`Website: ${args.companyWebsite}`);
  }
  if (args.contactName) {
    const contactLine = args.contactTitle ? `${args.contactName} (${args.contactTitle})` : args.contactName;
    lines.push(`Contact: ${contactLine}`);
  }
  if (args.contactEmail) {
    lines.push(`Contact Email: ${args.contactEmail}`);
  }
  return lines.length ? lines.join("\n") : "User initiated regeneration";
}
