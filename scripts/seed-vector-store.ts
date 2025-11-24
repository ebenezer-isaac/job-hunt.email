#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";

import { loadEnvConfig } from "@next/env";
import "@/lib/polyfills/buffer";
import type { DebugLogger } from "@/lib/debug-logger";
import { Document } from "llamaindex";
import { getScriptLogger } from "./logger";

const projectRoot = process.cwd();
const isDev = process.env.NODE_ENV ? process.env.NODE_ENV !== "production" : true;
loadEnvConfig(projectRoot, isDev);

export async function seedVectorStore(existingLogger?: DebugLogger): Promise<void> {
  const logger = existingLogger ?? getScriptLogger("seed-vector-store");
  const { env } = await import("@/env");
  const { ensureStaticDocuments } = await import("@/lib/ai/llama/vector-store");

  logger.step("Starting vector store seeding", {
    persistDir: env.LLAMAINDEX_PERSIST_DIR,
    persistenceEnabled: env.LLAMAINDEX_ENABLE_PERSISTENCE,
  });

  if (!env.LLAMAINDEX_ENABLE_PERSISTENCE) {
    throw new Error("LLAMAINDEX_ENABLE_PERSISTENCE must be true to seed the store");
  }

  const reconDoc = await loadReconDocumentForSeeding(logger);
  await ensureStaticDocuments([reconDoc], { tolerateFailures: false });
  logger.info("Vector store seeded with recon strategy", {
    docId: reconDoc.id_,
    persistDir: env.LLAMAINDEX_PERSIST_DIR,
  });
}

if (require.main === module) {
  seedVectorStore().catch((error) => {
    const logger = getScriptLogger("seed-vector-store");
    logger.error("Vector store seeding failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  });
}

async function loadReconDocumentForSeeding(logger: DebugLogger): Promise<Document> {
  const filePath = path.resolve(projectRoot, "source_files", "recon_strat.txt");
  try {
    const text = await fs.readFile(filePath, "utf-8");
    logger.step("Loaded recon strategy file", { filePath, bytes: text.length });
    return new Document({
      id_: "recon-strategy",
      text: truncateText(text),
      metadata: { source: "recon_strategy" },
    });
  } catch (error) {
    logger.step("Recon strategy file missing, using fallback", {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Document({
      id_: "recon-strategy",
      text: "Recon strategy document missing.",
      metadata: { source: "recon_strategy" },
    });
  }
}

function truncateText(value: string, limit = 12000): string {
  if (!value) {
    return "";
  }
  return value.length > limit ? `${value.slice(0, limit)}\n...(truncated)` : value;
}
