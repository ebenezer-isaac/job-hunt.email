#!/usr/bin/env node
import { spawn } from "node:child_process";
import { constants, promises as fs } from "node:fs";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

import { getScriptLogger } from "./logger";
import { seedVectorStore } from "./seed-vector-store";

const projectRoot = process.cwd();
const isDev = process.env.NODE_ENV ? process.env.NODE_ENV !== "production" : true;
loadEnvConfig(projectRoot, isDev);

const logger = getScriptLogger("dev-bootstrap");

async function main() {
  await ensureVectorStoreArtifacts();
  await runNextDev();
}

async function ensureVectorStoreArtifacts(): Promise<void> {
  const { env } = await import("@/env");
  if (!env.LLAMAINDEX_ENABLE_PERSISTENCE) {
    logger.info("Skipping vector store bootstrap", {
      reason: "persistence-disabled",
    });
    return;
  }

  const persistDir = path.isAbsolute(env.LLAMAINDEX_PERSIST_DIR)
    ? env.LLAMAINDEX_PERSIST_DIR
    : path.join(projectRoot, env.LLAMAINDEX_PERSIST_DIR);
  const vectorStoreFile = path.join(persistDir, "vector_store.json");

  if (await pathExists(vectorStoreFile)) {
    logger.step("Vector store artifacts found", { vectorStoreFile });
    return;
  }

  logger.warn("Vector store artifacts missing, seeding now", { vectorStoreFile });
  await seedVectorStore(logger);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function runNextDev(): Promise<void> {
  const nextBin = require.resolve("next/dist/bin/next");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, "dev"], {
      stdio: "inherit",
      env: process.env,
    });

    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
    const forward = (signal: NodeJS.Signals) => {
      if (!child.killed) {
        child.kill(signal);
      }
    };
    signals.forEach((signal) => {
      process.on(signal, () => forward(signal));
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal as NodeJS.Signals);
        return;
      }
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`next dev exited with code ${code ?? "unknown"}`));
      }
    });
    child.on("error", (error) => reject(error));
  });
}

main().catch((error) => {
  logger.error("Dev bootstrap failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
