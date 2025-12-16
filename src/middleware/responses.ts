import { NextResponse, type NextRequest } from "next/server";
import { redirectToLogin } from "next-firebase-auth-edge";

import { LOGIN_PAGE_PATH, loginRedirectParamKey } from "@/lib/auth-config";
import { LOGIN_STATUS_PARAM_KEY } from "@/lib/auth-shared";
import { REQUEST_ID_HEADER } from "@/lib/debug-logger";

import { REDIRECT_WHITELIST } from "./constants";

type LoginStatusFlag = "allowlist-denied" | "invalid-token";

export function attachRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export function createLoginRedirectResponse(
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
