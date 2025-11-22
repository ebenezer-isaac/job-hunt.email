import { NextRequest, NextResponse } from "next/server";
import "@/lib/logging/server-writer-bootstrap";
import { getAccessControlConfig, isUserAllowed } from "@/lib/security/allowed-users";
import { REQUEST_ID_HEADER, createDebugLogger } from "@/lib/debug-logger";
import { INTERNAL_TOKEN_HEADER, isValidInternalRequest } from "@/lib/security/internal-token";
import { env } from "@/env";
import { getAuthClient } from "@/lib/firebase-admin";

const accessControlRouteLogger = createDebugLogger("access-control-check-route");

export const runtime = "nodejs";

type AccessControlPayload = {
  uid?: string;
  email?: string | null;
};

export async function POST(request: NextRequest) {
  const requestId = request.headers.get(REQUEST_ID_HEADER);
  const logger = requestId ? accessControlRouteLogger.withRequestId(requestId) : accessControlRouteLogger;
  
  logger.info("Access control check initiated", {
    projectId: env.FIREBASE_PROJECT_ID,
    nodeEnv: env.NODE_ENV,
  });

  const token = request.headers.get(INTERNAL_TOKEN_HEADER);
  logger.info("Access-control check received", {
    hasToken: Boolean(token),
    tokenLength: token?.length ?? 0,
  });
  if (!isValidInternalRequest(token)) {
    logger.warn("Rejected access-control request: invalid token");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: AccessControlPayload;
  try {
    payload = await request.json();
  } catch {
    logger.warn("Invalid JSON payload received");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const uid = typeof payload.uid === "string" ? payload.uid.trim() : "";
  if (!uid) {
    logger.warn("Rejected access-control request: missing uid");
    return NextResponse.json({ error: "uid is required" }, { status: 400 });
  }

  const requestEmail = typeof payload.email === "string" ? payload.email : null;
  logger.info("Access-control payload parsed", {
    uid,
    requestEmail,
    hasRequestEmail: Boolean(requestEmail?.trim()),
  });
  const emailResolution = await resolveEmailForUid(uid, requestEmail, logger);
  logger.info("Email resolution completed", {
    uid,
    requestEmail,
    resolutionSource: emailResolution.source,
    firebaseLookupAttempted: emailResolution.firebaseLookupAttempted,
    firebaseLookupError: emailResolution.firebaseLookupError ?? null,
  });
  const email = emailResolution.email;
  logger.step("Evaluating access-control decision", {
    uid,
    requestEmail,
    resolvedEmail: email,
    resolutionSource: emailResolution.source,
  });

  try {
    const allowed = await isUserAllowed(uid, email);
    logger.step("Access-control decision computed", {
      uid,
      email,
      allowed,
    });
    logger.info("Access-control decision summary", {
      uid,
      resolvedEmail: email,
      resolutionSource: emailResolution.source,
      allowed,
    });
    const debug = await buildAccessControlDebugPayload(uid, email ?? null, emailResolution);
    return NextResponse.json({ allowed, debug });
  } catch (error) {
    logger.error("Access control evaluation failed", {
      uid,
      email,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Unable to determine access" }, { status: 500 });
  }
}

type EmailResolutionDetails = {
  email: string | null;
  source: "request" | "firebase" | "firebase-missing" | "firebase-error" | "none";
  firebaseLookupAttempted: boolean;
  firebaseLookupError?: string | null;
};

async function buildAccessControlDebugPayload(
  uid: string,
  email: string | null,
  resolution?: EmailResolutionDetails,
) {
  const config = await getAccessControlConfig();
  const normalizedEmail = email?.trim().toLowerCase() || null;
  const normalizedConfigEmails = config.allowedEmails.map((value) => value.toLowerCase());
  const emailAllowed = Boolean(normalizedEmail && normalizedConfigEmails.includes(normalizedEmail));
  const uidAllowed = config.allowedUids.includes(uid);
  return {
    timestamp: new Date().toISOString(),
    uid,
    suppliedEmail: email,
    normalizedEmail,
    uidAllowed,
    emailAllowed,
    allowedReason: uidAllowed ? "uid" : emailAllowed ? "email" : "none",
    config,
    environment: {
      nodeEnv: env.NODE_ENV,
      firebaseProjectId: env.FIREBASE_PROJECT_ID,
      internalTokenConfigured: Boolean(env.ACCESS_CONTROL_INTERNAL_TOKEN),
    },
    emailResolution: resolution
      ? {
          source: resolution.source,
          firebaseLookupAttempted: resolution.firebaseLookupAttempted,
          firebaseLookupError: resolution.firebaseLookupError ?? null,
        }
      : null,
  } as const;
}

async function resolveEmailForUid(
  uid: string,
  requestEmail: string | null,
  logger: ReturnType<typeof createDebugLogger>,
): Promise<EmailResolutionDetails> {
  if (requestEmail?.trim()) {
    const normalized = requestEmail.trim();
    logger.step("Using email supplied in request", { uid, email: normalized });
    return {
      email: normalized,
      source: "request",
      firebaseLookupAttempted: false,
    };
  }

  try {
    const userRecord = await getAuthClient().getUser(uid);
    const firebaseEmail = userRecord.email?.trim() || null;
    if (firebaseEmail) {
      logger.step("Resolved email via Firebase lookup", { uid, email: firebaseEmail });
      return {
        email: firebaseEmail,
        source: "firebase",
        firebaseLookupAttempted: true,
      };
    }
    logger.warn("Firebase lookup returned user without email", { uid });
    return {
      email: null,
      source: "firebase-missing",
      firebaseLookupAttempted: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Firebase email lookup failed", { uid, error: message });
    return {
      email: null,
      source: "firebase-error",
      firebaseLookupAttempted: true,
      firebaseLookupError: message,
    };
  }
}
