'use client';

import { useCallback, useState } from "react";

export type ArtifactPayload = {
  content: string;
  downloadUrl?: string;
  storageKey?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  pageCount?: number | null;
  emailAddresses?: string[];
  subject?: string;
  body?: string;
  toAddress?: string;
  changeSummary?: string;
};

export type GenerationArtifacts = {
  cv?: ArtifactPayload;
  coverLetter?: ArtifactPayload;
  coldEmail?: ArtifactPayload;
};

type ConsumeOptions = {
  onLine?: (line: string) => void;
  onArtifacts?: (artifacts: GenerationArtifacts) => void;
};

export function useStreamableValue() {
  const [lines, setLines] = useState<string[]>([]);
  const [artifacts, setArtifacts] = useState<GenerationArtifacts | null>(null);

  const reset = useCallback(() => {
    setLines([]);
    setArtifacts(null);
  }, []);

  const consume = useCallback(
    async (stream: ReadableStream<Uint8Array>, options?: ConsumeOptions) => {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const segments = buffer.split("\n");
          buffer = segments.pop() ?? "";

          for (const rawLine of segments) {
            const line = rawLine.trim();
            if (!line) {
              continue;
            }

            const parsed = tryParseJson(line);
            if (parsed) {
              setArtifacts(parsed);
              options?.onArtifacts?.(parsed);
            } else {
              setLines((prev) => [...prev, line]);
              options?.onLine?.(line);
            }
          }
        }

        const trailing = buffer.trim();
        if (trailing) {
          const parsed = tryParseJson(trailing);
          if (parsed) {
            setArtifacts(parsed);
            options?.onArtifacts?.(parsed);
          } else {
            setLines((prev) => [...prev, trailing]);
            options?.onLine?.(trailing);
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
    [],
  );

  return {
    lines,
    artifacts,
    consume,
    reset,
  };
}

function tryParseJson(line: string): GenerationArtifacts | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as GenerationArtifacts;
  } catch {
    return null;
  }
}
