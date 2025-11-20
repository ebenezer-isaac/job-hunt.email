import "server-only";

import { env } from "@/env";

export const INTERNAL_TOKEN_HEADER = "x-internal-token" as const;

export function getInternalToken(): string {
  return env.ACCESS_CONTROL_INTERNAL_TOKEN;
}

export function isValidInternalRequest(token: string | null | undefined): boolean {
  const expected = getInternalToken();
  if (!expected) {
    return false;
  }
  return typeof token === "string" && token.length > 0 && token === expected;
}
