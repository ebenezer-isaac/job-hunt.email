import { NextRequest, NextResponse } from "next/server";
import { refreshNextResponseCookies } from "next-firebase-auth-edge/lib/next/cookies";
import { authCookieOptions } from "@/lib/auth-config";
import { createDebugLogger, REQUEST_ID_HEADER } from "@/lib/debug-logger";

export async function POST(request: NextRequest) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
  const logger = createDebugLogger("api-token-refresh", { requestId });
  logger.step("Token refresh request received");
  try {
    const response = NextResponse.json({ success: true });
    await refreshNextResponseCookies(request, response, authCookieOptions);
    response.headers.set(REQUEST_ID_HEADER, requestId);
    logger.info("Token refresh successful");
    return response;
  } catch (error) {
    logger.error("Failed to refresh auth cookies", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        success: false,
        message: "Unable to refresh authentication session",
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
