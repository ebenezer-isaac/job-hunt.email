import { NextRequest, NextResponse } from "next/server";
import { isUserAllowed } from "@/lib/security/allowed-users";
import { createDebugLogger } from "@/lib/debug-logger";
import { INTERNAL_TOKEN_HEADER, isValidInternalRequest } from "@/lib/security/internal-token";

const accessControlRouteLogger = createDebugLogger("access-control-check-route");

export const runtime = "nodejs";

type AccessControlPayload = {
  uid?: string;
  email?: string | null;
};

export async function POST(request: NextRequest) {
  const token = request.headers.get(INTERNAL_TOKEN_HEADER);
  if (!isValidInternalRequest(token)) {
    accessControlRouteLogger.warn("Rejected access-control request: invalid token");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: AccessControlPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const uid = typeof payload.uid === "string" ? payload.uid.trim() : "";
  if (!uid) {
    return NextResponse.json({ error: "uid is required" }, { status: 400 });
  }

  const email = typeof payload.email === "string" ? payload.email : null;

  try {
    const allowed = await isUserAllowed(uid, email);
    return NextResponse.json({ allowed });
  } catch (error) {
    accessControlRouteLogger.error("Access control evaluation failed", {
      uid,
      email,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Unable to determine access" }, { status: 500 });
  }
}
