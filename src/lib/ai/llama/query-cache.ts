import crypto from "node:crypto";

import type { Document } from "llamaindex";

import { env } from "@/env";

type CacheEntry = {
  value: string;
  expiresAt: number;
};

const ttlMs = env.LLAMAINDEX_CACHE_TTL_MS;
const maxEntries = env.LLAMAINDEX_CACHE_MAX_ENTRIES;
const cache = new Map<string, CacheEntry>();

function pruneExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

function enforceCapacity() {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    cache.delete(oldestKey);
  }
}

export function getCachedResponse(key: string): string | null {
  pruneExpiredEntries();
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

export function setCachedResponse(key: string, value: string): void {
  pruneExpiredEntries();
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  enforceCapacity();
}

export function buildCacheKey(prompt: string, documents: Document[]): string {
  const hash = crypto.createHash("sha256");
  hash.update(prompt);
  for (const doc of documents) {
    hash.update(doc.id_);
    if (doc.text) {
      hash.update(doc.text);
    }
    if (doc.metadata) {
      hash.update(JSON.stringify(doc.metadata));
    }
  }
  return hash.digest("hex");
}
