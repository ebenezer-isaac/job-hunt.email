import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

import { Document } from "llamaindex";

import { createDebugLogger } from "@/lib/debug-logger";

const logger = createDebugLogger("llama-documents");
const MAX_DOC_LENGTH = 12000;
let reconDocPromise: Promise<Document> | null = null;

export async function loadReconDocument(): Promise<Document> {
  if (!reconDocPromise) {
    reconDocPromise = (async () => {
      try {
        const filePath = path.resolve(process.cwd(), "source_files", "recon_strat.txt");
        const text = await fs.readFile(filePath, "utf-8");
        logger.step("Loaded recon strategy file", { filePath, bytes: text.length });
        return new Document({
          id_: "recon-strategy",
          text: truncateText(text),
          metadata: { source: "recon_strategy" },
        });
      } catch (error) {
        logger.warn("Missing recon strategy file", { error: error instanceof Error ? error.message : String(error) });
        return new Document({
          id_: "recon-strategy",
          text: "Recon strategy document missing.",
          metadata: { source: "recon_strategy" },
        });
      }
    })();
  }
  return reconDocPromise;
}

export function buildJobDocument(jobDescription: string, companyName: string, jobTitle: string): Document {
  return new Document({
    id_: "job-description",
    text: truncateText(jobDescription),
    metadata: { source: "job_description", company: companyName, role: jobTitle },
  });
}

export function buildCandidateDocument(originalCV: string, extensiveCV: string): Document {
  return new Document({
    id_: "candidate-profile",
    text: truncateText(`${originalCV}\n\n${extensiveCV}`),
    metadata: { source: "candidate" },
  });
}

export function buildContactDocuments(baseProfile: string, profileSnapshot?: string | null): Document[] {
  const docs = [new Document({ id_: "contact-base", text: baseProfile, metadata: { source: "structured" } })];
  if (profileSnapshot) {
    docs.push(new Document({ id_: "contact-web", text: truncateText(profileSnapshot, 15000), metadata: { source: "web" } }));
  }
  return docs;
}

export function truncateText(value: string, limit = MAX_DOC_LENGTH): string {
  if (!value) {
    return "";
  }
  return value.length > limit ? `${value.slice(0, limit)}\n...(truncated)` : value;
}
