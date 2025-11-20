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
import { ACCESS_CONTROL_CHECK_PATH, LOGIN_STATUS_PARAM_KEY } from "@/lib/auth-shared";
import {
  createConsoleLogTransport,
  createDebugLogger,
  REQUEST_ID_HEADER,
  type DebugLogger,
} from "@/lib/debug-logger";
import { INTERNAL_TOKEN_HEADER, getInternalToken } from "@/lib/security/internal-token";

const REDIRECT_WHITELIST = [
  ...PUBLIC_PAGE_PATHS,
  LOGIN_PATH,
  LOGOUT_PATH,
  REFRESH_TOKEN_PATH,
];

const bootstrapLogger = createDebugLogger("middleware-bootstrap");
bootstrapLogger.step("Auth middleware configured", {
  redirectWhitelist: REDIRECT_WHITELIST,
});

type AccessDecision = {
  allowed: boolean;
  expiresAt: number;
};

const ACCESS_DECISION_TTL_MS = 60_000;
const accessDecisionCache = new Map<string, AccessDecision>();

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(REQUEST_ID_HEADER, requestId);

  const middlewareLogger = createDebugLogger("middleware", {
    requestId,
    transport: createConsoleLogTransport(),
  });

  middlewareLogger.step("Middleware invoked", {
    pathname,
    headers: Object.fromEntries(request.headers.entries()),
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
      const allowed = await ensureUserAllowed(uid, email, request, requestId, middlewareLogger);
      if (!allowed) {
        middlewareLogger.warn("Valid token rejected due to allowlist", { uid, email });
        const redirectResponse = createLoginRedirectResponse(request, "allowlist-denied");
        redirectResponse.headers.set(REQUEST_ID_HEADER, requestId);
        return redirectResponse;
      }
      middlewareLogger.step("Valid token detected", {
        uid,
        email,
        metadata: tokens.metadata,
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
    handleInvalidToken: async () => {
      middlewareLogger.warn("Invalid token detected", { pathname });
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
): Promise<boolean> {
  const normalizedEmail = email?.trim() || null;
  const cacheKey = `${uid}:${normalizedEmail ?? ""}`;
  const cached = accessDecisionCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.allowed;
  }

  const endpoint = new URL(ACCESS_CONTROL_CHECK_PATH, request.nextUrl.origin);
  const internalToken = getInternalToken();
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

    if (!response.ok) {
      logger.error("Access control endpoint returned non-200", {
        status: response.status,
        endpoint: endpoint.toString(),
      });
      return false;
    }

    const payload = await response.json().catch(() => null);
    const allowed = Boolean(payload?.allowed);
    accessDecisionCache.set(cacheKey, {
      allowed,
      expiresAt: now + ACCESS_DECISION_TTL_MS,
    });
    return allowed;
  } catch (error) {
    logger.error("Access control fetch failed", {
      endpoint: endpoint.toString(),
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

type LoginStatusFlag = "allowlist-denied" | "invalid-token";

function createLoginRedirectResponse(request: NextRequest, status: LoginStatusFlag): NextResponse {
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
