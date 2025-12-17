import type { GenerationArtifacts } from "@/hooks/useStreamableValue";
import type { RetryHandler } from "@/lib/ai/model-client";
import type { ResearchBrief } from "@/lib/ai/llama/context-engine";
import type { createDebugLogger } from "@/lib/debug-logger";
import type { ParsedForm } from "../form";
import type { StoredArtifact } from "../storage";

export type EmitFn = (message: string) => Promise<void>;

export type ModelRetryNotifier = RetryHandler;

export type ActionLogger = ReturnType<typeof createDebugLogger>;

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
  userDisplayName?: string | null;
  emit: EmitFn;
  signal?: AbortSignal;
  log?: (entry: { content: string; level?: "info" | "success" | "warning" | "error" }) => void;
};