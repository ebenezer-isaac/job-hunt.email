import { NextRequest, NextResponse } from "next/server";
import { removeAuthCookies } from "next-firebase-auth-edge/lib/next/cookies";
import { authCookieOptions } from "@/lib/auth-config";
import { createDebugLogger, REQUEST_ID_HEADER } from "@/lib/debug-logger";

export async function POST(request: NextRequest) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
  const logger = createDebugLogger("api-logout", { requestId });
  try {
    const response = await removeAuthCookies(request.headers, {
      cookieName: authCookieOptions.cookieName,
      cookieSerializeOptions: authCookieOptions.cookieSerializeOptions,
    });
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  } catch (error) {
    logger.error("Failed to clear auth cookies", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        success: false,
        message: "Unable to clear authentication session",
      },
      { status: 500, headers: { [REQUEST_ID_HEADER]: requestId } },
    );
  }
}

export function GET(request: NextRequest) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
  return NextResponse.json(
    { success: false, message: "Method not allowed" },
    {
      status: 405,
      headers: { Allow: "POST", [REQUEST_ID_HEADER]: requestId },
    },
  );
}
