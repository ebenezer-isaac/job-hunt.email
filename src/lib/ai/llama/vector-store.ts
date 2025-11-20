import crypto from "node:crypto";
import path from "node:path";

import { Document, VectorStoreIndex } from "llamaindex";
import { storageContextFromDefaults } from "llamaindex/storage";

import { env } from "@/env";
import { createDebugLogger } from "@/lib/debug-logger";
import { ensureLlamaRuntime } from "./runtime";

const logger = createDebugLogger("llama-vector-store");
const persistenceConfigured = env.LLAMAINDEX_ENABLE_PERSISTENCE;
const persistDir = path.isAbsolute(env.LLAMAINDEX_PERSIST_DIR)
  ? env.LLAMAINDEX_PERSIST_DIR
  : path.join(process.cwd(), env.LLAMAINDEX_PERSIST_DIR);
let persistenceHealthy = true;
let persistenceDisableReason: string | null = null;

export class PersistenceUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "PersistenceUnavailableError";
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isEmptyIndexError(error: unknown): boolean {
  return toErrorMessage(error).includes("Cannot initialize VectorStoreIndex without nodes or indexStruct");
}

function disablePersistence(error: unknown, context: string) {
  const reason = `${context}: ${toErrorMessage(error)}`;
  if (!persistenceHealthy) {
    logger.warn("persistence-already-disabled", { context, reason, persistDir });
    return;
  }
  persistenceHealthy = false;
  persistenceDisableReason = reason;
  logger.error("persistent-store-disabled", { context, reason, persistDir });
}

function handlePersistenceError(error: unknown, context: string): PersistenceUnavailableError {
  if (error instanceof PersistenceUnavailableError) {
    disablePersistence(error.cause ?? error, context);
    return error;
  }
  disablePersistence(error, context);
  return new PersistenceUnavailableError("Persistent vector store unavailable", { cause: error });
}

class AsyncMutex {
  private last: Promise<void> = Promise.resolve();

  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const ready = this.last.catch(() => undefined);
    let resolveNext: () => void = () => undefined;
    const next = new Promise<void>((resolve) => {
      resolveNext = resolve;
    });
    this.last = ready.then(() => next);
    await ready;
    try {
      return await task();
    } finally {
      resolveNext();
    }
  }
}

const indexMutex = new AsyncMutex();
let indexPromise: Promise<VectorStoreIndex> | null = null;

async function buildPersistentIndex(): Promise<VectorStoreIndex> {
  ensureLlamaRuntime();
  const storageContext = await storageContextFromDefaults({ persistDir });
  try {
    return await VectorStoreIndex.init({ storageContext });
  } catch (error) {
    if (isEmptyIndexError(error)) {
      logger.step("vector-index-bootstrap", { persistDir });
      return bootstrapPersistentIndex(storageContext);
    }
    throw error;
  }
}

async function bootstrapPersistentIndex(storageContext: Awaited<ReturnType<typeof storageContextFromDefaults>>): Promise<VectorStoreIndex> {
  const placeholder = new Document({ id_: "bootstrap-placeholder", text: "bootstrap" });
  const index = await VectorStoreIndex.fromDocuments([placeholder], { storageContext });
  await index.deleteRefDoc(placeholder.id_, true);
  logger.step("vector-index-bootstrapped", { persistDir });
  return index;
}

async function getPersistentIndex(): Promise<VectorStoreIndex> {
  if (!persistenceConfigured) {
    throw new PersistenceUnavailableError("Persistent vector store disabled via configuration");
  }
  if (!persistenceHealthy) {
    throw new PersistenceUnavailableError(
      persistenceDisableReason ?? "Persistent vector store unavailable",
    );
  }
  if (!indexPromise) {
    indexPromise = buildPersistentIndex()
      .then((index) => {
        logger.step("vector-index-ready", { persistDir });
        return index;
      })
      .catch((error) => {
        indexPromise = null;
        throw handlePersistenceError(error, "init-persistent-index");
      });
  }
  return indexPromise;
}

function computeHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function upsertDocument(index: VectorStoreIndex, doc: Document): Promise<void> {
  const existing = await index.docStore.getDocument(doc.id_, false);
  const incomingHash = computeHash(doc.text ?? "");
  if (existing?.metadata?.versionHash === incomingHash) {
    return;
  }
  if (existing) {
    await index.deleteRefDoc(doc.id_, true);
  }
  doc.metadata = {
    ...doc.metadata,
    versionHash: incomingHash,
    persistedAt: new Date().toISOString(),
  };
  await index.insert(doc);
  logger.step("upserted-static-doc", { docId: doc.id_ });
}

export async function ensureStaticDocuments(
  documents: Document[],
  options?: { tolerateFailures?: boolean },
): Promise<void> {
  if (!persistenceConfigured || documents.length === 0 || !persistenceHealthy) {
    return;
  }
  const { tolerateFailures = true } = options ?? {};
  try {
    const index = await getPersistentIndex();
    await indexMutex.runExclusive(async () => {
      for (const doc of documents) {
        await upsertDocument(index, doc);
      }
    });
  } catch (error) {
    const persistenceError = handlePersistenceError(error, "ensure-static-docs");
    if (!tolerateFailures) {
      throw persistenceError;
    }
    logger.warn("Static document persistence failed; continuing without persistence", {
      reason: persistenceError.message,
    });
  }
}

export async function queryPersistentIndex(transientDocs: Document[], prompt: string) {
  if (!persistenceConfigured) {
    throw new PersistenceUnavailableError("Persistent vector store disabled via configuration");
  }
  if (!persistenceHealthy) {
    throw new PersistenceUnavailableError(
      persistenceDisableReason ?? "Persistent vector store unavailable",
    );
  }

  try {
    const index = await getPersistentIndex();
    return indexMutex.runExclusive(async () => {
      const inserted: string[] = [];
      for (const doc of transientDocs) {
        await index.insert(doc);
        inserted.push(doc.id_);
      }

      try {
        const queryEngine = index.asQueryEngine({ similarityTopK: 8 });
        return queryEngine.query({ query: prompt });
      } finally {
        await Promise.all(
          inserted.map(async (docId) => {
            try {
              await index.deleteRefDoc(docId, true);
            } catch (error) {
              logger.warn("cleanup-failed", { docId, error: error instanceof Error ? error.message : String(error) });
            }
          }),
        );
      }
    });
  } catch (error) {
    throw handlePersistenceError(error, "query-persistent-index");
  }
}

export function isPersistenceEnabled(): boolean {
  return persistenceConfigured && persistenceHealthy;
}
