import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authMiddleware, redirectToLogin } from "next-firebase-auth-edge";

import {
  authCookieOptions,
  isBypassPath,
  isPublicPagePath,
  LOGIN_PATH,
  LOGOUT_PATH,
  LOGIN_PAGE_PATH,
  REFRESH_TOKEN_PATH,
  loginRedirectParamKey,
  shouldDebugAuth,
} from "@/lib/auth-config";
import {
  LOG_ENDPOINT_PATH,
  createConsoleLogTransport,
  createDebugLogger,
  createHttpLogTransport,
  REQUEST_ID_HEADER,
} from "@/lib/debug-logger";
import { INTERNAL_TOKEN_HEADER, getInternalToken } from "@/lib/security/internal-token";

import { REDIRECT_WHITELIST } from "./constants";
import { ensureUserAllowed } from "./access-control";
import { persistEdgeLogEntry } from "./logging";
import { resolveServerOrigin } from "./origin";
import { attachRequestId, createLoginRedirectResponse } from "./responses";

const bootstrapLogger = createDebugLogger("middleware-bootstrap");
bootstrapLogger.step("Auth middleware configured", {
  redirectWhitelist: REDIRECT_WHITELIST,
});

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
