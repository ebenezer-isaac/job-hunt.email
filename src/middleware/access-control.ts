import type { NextRequest } from "next/server";

import { ACCESS_CONTROL_CHECK_PATH } from "@/lib/auth-shared";
import { REQUEST_ID_HEADER, type DebugLogger } from "@/lib/debug-logger";
import { INTERNAL_TOKEN_HEADER } from "@/lib/security/internal-token";

import { ACCESS_DECISION_TTL_MS } from "./constants";
import { persistEdgeLogEntry } from "./logging";

export type AccessDecision = {
  allowed: boolean;
  expiresAt: number;
  payload?: unknown;
};

export type AccessDecisionResult = {
  allowed: boolean;
  payload: unknown;
};

const accessDecisionCache = new Map<string, AccessDecision>();

export async function ensureUserAllowed(
  uid: string,
  email: string | null,
  request: NextRequest,
  requestId: string,
  logger: DebugLogger,
  internalToken: string,
  serverOrigin: string,
): Promise<AccessDecisionResult> {
  const normalizedEmail = email?.trim() || null;
  const cacheKey = `${uid}:${normalizedEmail ?? ""}`;
  const cached = accessDecisionCache.get(cacheKey);
  const now = Date.now();
  if (cached) {
    if (cached.expiresAt > now) {
      logger.step("Access decision cache hit", {
        uid,
        email: normalizedEmail,
        allowed: cached.allowed,
      });
      return { allowed: cached.allowed, payload: cached.payload ?? null };
    }
    logger.step("Access decision cache expired", {
      uid,
      email: normalizedEmail,
      expiredAt: cached.expiresAt,
    });
    accessDecisionCache.delete(cacheKey);
  } else {
    logger.step("Access decision cache miss", { uid, email: normalizedEmail });
  }

  const endpoint = new URL(ACCESS_CONTROL_CHECK_PATH, serverOrigin);
  logger.step("Calling access-control endpoint", {
    endpoint: endpoint.toString(),
    uid,
    email: normalizedEmail,
  });
  logger.info("Access-control fetch dispatching", {
    endpoint: endpoint.toString(),
    uid,
    hasEmail: Boolean(normalizedEmail),
    requestId,
  });
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify({ uid, email: normalizedEmail }),
      headers: {
        "content-type": "application/json",
        [REQUEST_ID_HEADER]: requestId,
        [INTERNAL_TOKEN_HEADER]: internalToken,
      },
      cache: "no-store",
    });

    logger.info("Access-control fetch completed", {
      uid,
      requestId,
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => null);
      logger.error("Access control endpoint returned non-200", {
        status: response.status,
        endpoint: endpoint.toString(),
        bodySnippet: errorText ? errorText.slice(0, 512) : null,
      });
      await persistEdgeLogEntry(
        "error",
        "Access control endpoint returned non-200",
        {
          uid,
          email: normalizedEmail,
          status: response.status,
          bodySnippet: errorText ? errorText.slice(0, 256) : null,
        },
        requestId,
        serverOrigin,
        internalToken,
        logger,
      );
      const failurePayload = {
        status: response.status,
        endpoint: endpoint.toString(),
        bodySnippet: errorText ? errorText.slice(0, 256) : null,
      } satisfies Record<string, unknown>;
      return { allowed: false, payload: failurePayload };
    }

    const payload = await response.json().catch((jsonError) => {
      logger.error("Failed to parse access control response JSON", {
        endpoint: endpoint.toString(),
        jsonError: jsonError instanceof Error ? jsonError.message : String(jsonError),
      });
      return null;
    });
    const allowed = Boolean(payload?.allowed);
    logger.step("Access control response received", {
      status: response.status,
      allowed,
      payload,
    });
    logger.info("Access-control fetch payload", {
      uid,
      requestId,
      allowed,
      debugSource: payload?.debug?.emailResolution?.source ?? null,
      hasResolvedEmail: Boolean(payload?.debug?.normalizedEmail),
    });
    accessDecisionCache.set(cacheKey, {
      allowed,
      expiresAt: now + ACCESS_DECISION_TTL_MS,
      payload,
    });
    logger.step("Cached access decision", {
      uid,
      email: normalizedEmail,
      allowed,
      expiresAt: now + ACCESS_DECISION_TTL_MS,
    });
    return { allowed, payload };
  } catch (error) {
    logger.error("Access control fetch failed", {
      endpoint: endpoint.toString(),
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    await persistEdgeLogEntry(
      "error",
      "Access control fetch failed",
      {
        uid,
        email: normalizedEmail,
        endpoint: endpoint.toString(),
        error: error instanceof Error ? error.message : String(error),
      },
      requestId,
      serverOrigin,
      internalToken,
      logger,
    );
    const failurePayload = {
      endpoint: endpoint.toString(),
      error: error instanceof Error ? error.message : String(error),
    } satisfies Record<string, unknown>;
    return { allowed: false, payload: failurePayload };
  }
}

export function accessDecisionCacheSize(): number {
  return accessDecisionCache.size;
}
