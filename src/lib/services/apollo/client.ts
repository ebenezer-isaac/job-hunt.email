import { env } from "@/env";
import { createDebugLogger } from "@/lib/debug-logger";
import { BASE_URL } from "./config";

const httpLogger = createDebugLogger("apollo-http");

export async function fetchJson<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": env.APOLLO_API_KEY,
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      httpLogger.error("Apollo API request failed", { path, status: response.status, body });
      throw new Error(`Apollo API responded with ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
