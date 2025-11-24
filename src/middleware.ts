import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authMiddleware, redirectToLogin } from "next-firebase-auth-edge";
import {
  authCookieOptions,
  isBypassPath,
  isPublicPagePath,
  LOGIN_PAGE_PATH,
  LOGIN_PATH,
  LOGOUT_PATH,
  PUBLIC_PAGE_PATHS,
  REFRESH_TOKEN_PATH,
  loginRedirectParamKey,
  shouldDebugAuth,
} from "@/lib/auth-config";
import {
  ACCESS_CONTROL_CHECK_PATH,
  LOGIN_STATUS_PARAM_KEY,
} from "@/lib/auth-shared";
import {
  LOG_ENDPOINT_PATH,
  createConsoleLogTransport,
  createDebugLogger,
  createHttpLogTransport,
  REQUEST_ID_HEADER,
  type DebugLogger,
} from "@/lib/debug-logger";
import type { LogLevel } from "@/lib/logging/types";
import { INTERNAL_TOKEN_HEADER, getInternalToken } from "@/lib/security/internal-token";

const REDIRECT_WHITELIST = [
  ...PUBLIC_PAGE_PATHS,
  LOGIN_PATH,
  LOGOUT_PATH,
  REFRESH_TOKEN_PATH,
  "/guide",
];

const bootstrapLogger = createDebugLogger("middleware-bootstrap");
bootstrapLogger.step("Auth middleware configured", {
  redirectWhitelist: REDIRECT_WHITELIST,
});

type AccessDecision = {
  allowed: boolean;
  expiresAt: number;
  payload?: unknown;
};

type AccessDecisionResult = {
  allowed: boolean;
  payload: unknown;
};

const ACCESS_DECISION_TTL_MS = 60_000;
const accessDecisionCache = new Map<string, AccessDecision>();

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(REQUEST_ID_HEADER, requestId);
  const internalToken = getInternalToken();
  const serverOrigin = resolveServerOrigin(request);

  if (pathname === LOG_ENDPOINT_PATH) {
    if (internalToken) {
      forwardedHeaders.set(INTERNAL_TOKEN_HEADER, internalToken);
    }
    const logBypassResponse = NextResponse.next({
      request: { headers: forwardedHeaders },
    });
    logBypassResponse.headers.set(REQUEST_ID_HEADER, requestId);
    return logBypassResponse;
  }
  const logTransport = internalToken
    ? createHttpLogTransport(serverOrigin, {
        headers: {
          [INTERNAL_TOKEN_HEADER]: internalToken,
        },
      })
    : createConsoleLogTransport();

  const middlewareLogger = createDebugLogger("middleware", {
    requestId,
    transport: logTransport,
  });

  middlewareLogger.step("Resolved server origin", { serverOrigin });
  middlewareLogger.step("Middleware invoked", {
    method: request.method,
    pathname,
    hasAuthorizationHeader: request.headers.has("authorization"),
    hasCookies: request.headers.has("cookie"),
  });

  middlewareLogger.step("Internal token resolution", {
    hasInternalToken: Boolean(internalToken),
    tokenLength: internalToken?.length ?? 0,
  });

  middlewareLogger.step("Log transport selected", {
    transportType: internalToken ? "http" : "console",
  });

  if (isBypassPath(pathname) || isPublicPagePath(pathname)) {
    middlewareLogger.step("Path bypassed", { pathname });
    const response = NextResponse.next({
      request: { headers: forwardedHeaders },
    });
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  }

  const response = authMiddleware(request, {
    ...authCookieOptions,
    loginPath: LOGIN_PATH,
    logoutPath: LOGOUT_PATH,
    refreshTokenPath: REFRESH_TOKEN_PATH,
    debug: shouldDebugAuth,
    handleValidToken: async (tokens, headers) => {
      const uid = tokens.decodedToken.uid;
      const email = tokens.decodedToken.email ?? null;
      
      middlewareLogger.step("Validating token against allowlist", { uid, email });
      
      const decision = await ensureUserAllowed(
        uid,
        email,
        request,
        requestId,
        middlewareLogger,
        internalToken,
        serverOrigin,
      );
      const debugPayload = decision.payload ?? null;
      if (!decision.allowed) {
        middlewareLogger.warn("Valid token rejected due to allowlist", { uid, email, debugPayload });
        await persistEdgeLogEntry(
          "warn",
          "Valid token rejected due to allowlist",
          { uid, email, decision: debugPayload },
          requestId,
          serverOrigin,
          internalToken,
          middlewareLogger,
        );
        const redirectResponse = createLoginRedirectResponse(request, "allowlist-denied");
        redirectResponse.headers.set(REQUEST_ID_HEADER, requestId);
        return redirectResponse;
      }
      middlewareLogger.step("Valid token detected and allowed", {
        uid,
        email,
        metadata: tokens.metadata,
        decision: debugPayload ?? null,
      });
      headers.set("x-user-uid", uid ?? "");
      if (email) {
        headers.set("x-user-email", email);
      }
      if (tokens.metadata && Object.keys(tokens.metadata).length > 0) {
        headers.set("x-user-metadata", JSON.stringify(tokens.metadata));
      }
      headers.set("x-user-authenticated", "true");
      headers.set(REQUEST_ID_HEADER, requestId);
      middlewareLogger.data("augmented-headers", Object.fromEntries(headers.entries()));
      const nextResponse = NextResponse.next({
        request: { headers },
      });
      nextResponse.headers.set(REQUEST_ID_HEADER, requestId);
      return nextResponse;
    },
    handleInvalidToken: async (reason) => {
      const hasAuthCookie = request.cookies.has(authCookieOptions.cookieName);
      if (!hasAuthCookie) {
        middlewareLogger.info("Unauthenticated access attempt", { pathname });
        const response = redirectToLogin(request, {
          path: LOGIN_PAGE_PATH,
          redirectParamKeyName: loginRedirectParamKey,
          publicPaths: REDIRECT_WHITELIST,
        });
        response.headers.set(REQUEST_ID_HEADER, requestId);
        return response;
      }

      middlewareLogger.warn("Invalid token detected", { pathname, reason });
      const redirectResponse = createLoginRedirectResponse(request, "invalid-token");
      redirectResponse.headers.set(REQUEST_ID_HEADER, requestId);
      return redirectResponse;
    },
  });

  if (response instanceof Promise) {
    return response.then((res) => attachRequestId(res, requestId));
  }
  return attachRequestId(response, requestId);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|site.webmanifest|manifest.json|assets/).*)",
  ],
};

function attachRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

async function ensureUserAllowed(
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
      };
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
    };
    return { allowed: false, payload: failurePayload };
  }
}

type LoginStatusFlag = "allowlist-denied" | "invalid-token";

function createLoginRedirectResponse(
  request: NextRequest,
  status: LoginStatusFlag,
): NextResponse {
  const response = redirectToLogin(request, {
    path: LOGIN_PAGE_PATH,
    redirectParamKeyName: loginRedirectParamKey,
    publicPaths: REDIRECT_WHITELIST,
  });
  const location = response.headers.get("Location");
  if (!location) {
    return response;
  }
  try {
    const nextUrl = new URL(location, request.nextUrl.origin);
    nextUrl.searchParams.set(LOGIN_STATUS_PARAM_KEY, status);
    response.headers.set("Location", nextUrl.toString());
  } catch {
    // preserve original redirect if URL parsing fails
  }
  return response;
}

function resolveServerOrigin(request: NextRequest): string {
  const explicit = resolveExplicitOriginFromEnv();
  if (explicit) {
    return explicit;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = request.headers.get("host");
  if (host) {
    const protocol = forwardedProto ?? request.nextUrl.protocol?.replace(/:$/, "") ?? "https";
    return `${protocol}://${host}`;
  }

  const requestOrigin = request.nextUrl.origin;
  return requestOrigin ? trimTrailingSlash(requestOrigin) : "";
}

function resolveExplicitOriginFromEnv(): string | null {
  const envOrigin =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  if (!envOrigin) {
    return null;
  }
  return trimTrailingSlash(envOrigin);
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function persistEdgeLogEntry(
  level: LogLevel,
  message: string,
  data: Record<string, unknown> | null,
  requestId: string,
  serverOrigin: string,
  internalToken: string | null | undefined,
  logger: DebugLogger,
): Promise<void> {
  if (!internalToken) {
    logger.warn("Skipping Firestore log persistence: missing internal token", { message, level });
    return;
  }
  try {
    const endpoint = new URL(LOG_ENDPOINT_PATH, serverOrigin);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [REQUEST_ID_HEADER]: requestId,
        [INTERNAL_TOKEN_HEADER]: internalToken,
      },
      body: JSON.stringify({
        entry: {
          timestamp: new Date().toISOString(),
          scope: "middleware",
          level,
          message,
          data: data ?? undefined,
          requestId,
        },
      }),
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => null);
      logger.error("Failed to persist middleware log entry via API", {
        message,
        level,
        status: response.status,
        bodySnippet: errorBody ? errorBody.slice(0, 256) : null,
      });
    }
  } catch (error) {
    logger.error("Middleware log persistence threw", {
      message,
      level,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
