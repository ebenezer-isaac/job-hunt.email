import { NextRequest, NextResponse } from "next/server";
import "@/lib/logging/server-writer-bootstrap";
import { setAuthCookies } from "next-firebase-auth-edge/lib/next/cookies";
import { authCookieOptions } from "@/lib/auth-config";
import { createDebugLogger, REQUEST_ID_HEADER } from "@/lib/debug-logger";
import { env } from "@/env";
import { getAuthClient } from "@/lib/firebase-admin";
import { isUserAllowed } from "@/lib/security/allowed-users";
import { quotaService } from "@/lib/security/quota-service";

export async function POST(request: NextRequest) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
  const logger = createDebugLogger("api-login", { requestId });
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      logger.warn("Missing bearer token on login request");
      return NextResponse.json(
        { success: false, message: "Authorization token missing" },
        { status: 401, headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    }

    const idToken = authHeader.slice("bearer ".length).trim();
    logger.step("Verifying ID token");
    const decoded = await getAuthClient().verifyIdToken(idToken);
    
    logger.step("Checking allowlist for user", { uid: decoded.uid, email: decoded.email });
    const allowed = await isUserAllowed(decoded.uid, decoded.email ?? null);
    if (!allowed) {
      logger.warn("Blocked login for non-whitelisted user", {
        uid: decoded.uid,
        email: decoded.email ?? null,
      });
      return NextResponse.json(
        {
          success: false,
          message:
            `This workspace is in closed testing. Email ${env.CONTACT_EMAIL} to request access.`,
        },
        { status: 403, headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    }

    logger.step("Ensuring user profile exists");
    await quotaService.ensureProfile({
      uid: decoded.uid,
      email: decoded.email ?? "",
      displayName: decoded.name ?? null,
      photoURL: decoded.picture ?? null,
    });

    logger.step("Setting auth cookies");
    const response = await setAuthCookies(request.headers, authCookieOptions);
    response.headers.set(REQUEST_ID_HEADER, requestId);
    logger.info("Login successful", { uid: decoded.uid });
    return response;
  } catch (error) {
    logger.error("Failed to set auth cookies", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        success: false,
        message: "Unable to establish authentication session",
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
