import { Document, EngineResponse, VectorStoreIndex } from "llamaindex";

import { createDebugLogger } from "@/lib/debug-logger";
import { buildCacheKey, getCachedResponse, setCachedResponse } from "@/lib/ai/llama/query-cache";
import {
  isPersistenceEnabled,
  queryPersistentIndex,
  PersistenceUnavailableError,
} from "@/lib/ai/llama/vector-store";

const logger = createDebugLogger("llama-query");

export type QueryDocumentsOptions = {
  prompt: string;
  staticDocs: Document[];
  transientDocs: Document[];
  cacheKeyHint: string;
};

export async function queryDocuments({ prompt, staticDocs, transientDocs, cacheKeyHint }: QueryDocumentsOptions): Promise<string> {
  const docsForHash = [...staticDocs, ...transientDocs];
  const cacheKey = buildCacheKey(`${cacheKeyHint}:${prompt}`, docsForHash);
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    logger.step("query-cache-hit", { cacheKeyHint });
    return cached;
  }

  let response: EngineResponse;
  if (isPersistenceEnabled()) {
    try {
      response = await queryPersistentIndex(transientDocs, prompt);
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) {
        logger.warn("persistence-fallback", {
          cacheKeyHint,
          reason: error.message,
        });
        response = await queryEphemeralIndex(docsForHash, prompt);
      } else {
        throw error;
      }
    }
  } else {
    response = await queryEphemeralIndex(docsForHash, prompt);
  }
  const text = extractResponseText(response);
  setCachedResponse(cacheKey, text);
  return text;
}

async function queryEphemeralIndex(documents: Document[], prompt: string): Promise<EngineResponse> {
  const index = await VectorStoreIndex.fromDocuments(documents);
  const queryEngine = index.asQueryEngine({
    similarityTopK: 8,
  });
  return queryEngine.query({ query: prompt });
}

function extractResponseText(response: EngineResponse): string {
  const content = response.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part.type === "text") {
          return part.text;
        }
        if (part.type === "image_url") {
          return `[image] ${part.image_url.url}`;
        }
        if ("data" in part && typeof part.data === "string") {
          return `[${part.type}] length=${part.data.length}`;
        }
        return null;
      })
      .filter((value): value is string => Boolean(value))
      .join("\n");
  }
  return response.response ?? String(response);
}
