import type { CookieSerializeOptions } from "cookie";
import type { SetAuthCookiesOptions } from "next-firebase-auth-edge/lib/next/cookies";
import type { Path } from "next-firebase-auth-edge/lib/next/middleware";
import { env } from "@/env";
import {
  LOGIN_PAGE_PATH,
  LOGIN_PATH,
  LOGOUT_PATH,
  REFRESH_TOKEN_PATH,
  LOGIN_REDIRECT_PARAM_KEY,
  PUBLIC_ROUTE_SEGMENTS,
  PUBLIC_MIDDLEWARE_BYPASS_REGEX,
} from "@/lib/auth-shared";

export { LOGIN_PAGE_PATH, LOGIN_PATH, LOGOUT_PATH, REFRESH_TOKEN_PATH };

export type AuthMetadata = Record<string, unknown>;

const sanitizedPrivateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");

const cookieSerializeOptions: CookieSerializeOptions = {
  httpOnly: true,
  secure: env.FIREBASE_AUTH_COOKIE_SECURE,
  sameSite: env.FIREBASE_AUTH_COOKIE_SAME_SITE,
  path: "/",
  maxAge: env.FIREBASE_AUTH_COOKIE_MAX_AGE_SECONDS,
  domain: env.FIREBASE_AUTH_COOKIE_DOMAIN ?? undefined,
};

export const authCookieOptions: SetAuthCookiesOptions<AuthMetadata> = {
  cookieName: env.FIREBASE_AUTH_COOKIE_NAME,
  cookieSignatureKeys: env.FIREBASE_AUTH_COOKIE_SIGNATURE_KEYS,
  cookieSerializeOptions,
  apiKey: env.FIREBASE_API_KEY,
  serviceAccount: {
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: sanitizedPrivateKey,
  },
  enableMultipleCookies: true,
  enableTokenRefreshOnExpiredKidHeader: true,
};

export const PUBLIC_PAGE_PATHS: Path[] = PUBLIC_ROUTE_SEGMENTS as Path[];

export const shouldDebugAuth = env.FIREBASE_AUTH_DEBUG;

export const loginRedirectParamKey = LOGIN_REDIRECT_PARAM_KEY;

export const publicMiddlewareBypassRegex = PUBLIC_MIDDLEWARE_BYPASS_REGEX;

export function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function isPublicPagePath(pathname: string): boolean {
  const normalizedPath = normalizePath(pathname);
  return PUBLIC_PAGE_PATHS.some((path) => {
    if (typeof path === "string") {
      return normalizePath(path) === normalizedPath;
    }
    return path.test(normalizedPath);
  });
}

export function isBypassPath(pathname: string): boolean {
  return publicMiddlewareBypassRegex.some((regex) => regex.test(pathname));
}
