import type { NextRequest } from "next/server";

export function resolveServerOrigin(request: NextRequest): string {
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
