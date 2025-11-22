'use server';

import { cookies } from "next/headers";
import { getTokens, type Tokens } from "next-firebase-auth-edge";
import { authCookieOptions, shouldDebugAuth, type AuthMetadata } from "@/lib/auth-config";
import { createDebugLogger } from "@/lib/debug-logger";

const tokenOptions = {
  cookieName: authCookieOptions.cookieName,
  cookieSignatureKeys: authCookieOptions.cookieSignatureKeys,
  cookieSerializeOptions: authCookieOptions.cookieSerializeOptions,
  apiKey: authCookieOptions.apiKey,
  serviceAccount: authCookieOptions.serviceAccount,
  enableTokenRefreshOnExpiredKidHeader:
    authCookieOptions.enableTokenRefreshOnExpiredKidHeader,
};

export type AuthTokens = Tokens<AuthMetadata>;

const authLogger = createDebugLogger("server-auth");
authLogger.step("Server auth helpers loaded");

export async function getServerAuthTokens(): Promise<AuthTokens | null> {
  authLogger.step("Fetching server auth tokens");
  const cookieStore = await cookies();
  const tokens = await getTokens<AuthMetadata>(cookieStore, {
    ...tokenOptions,
    debug: shouldDebugAuth,
  });
  if (tokens) {
    authLogger.step("Server auth tokens retrieved", { uid: tokens.decodedToken.uid });
  } else {
    authLogger.step("No server auth tokens found");
  }
  return tokens;
}

export async function requireServerAuthTokens(): Promise<AuthTokens> {
  const tokens = await getServerAuthTokens();
  if (!tokens) {
    authLogger.error("Server auth tokens missing in required call");
    throw new Error("User session is not available in the current context");
  }
  authLogger.step("Server auth tokens present", {
    uid: tokens.decodedToken.uid,
  });
  return tokens;
}

export async function getCurrentUserId(): Promise<string | null> {
  authLogger.step("Resolving current user id");
  const tokens = await getServerAuthTokens();
  const uid = tokens?.decodedToken.uid ?? null;
  authLogger.data("current-user-id", { uid });
  return uid;
}
