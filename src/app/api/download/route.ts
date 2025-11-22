import { NextRequest, NextResponse } from "next/server";
import { requireServerAuthTokens } from "@/lib/auth";
import { getStorageProvider } from "@/lib/storage/types";
import { normalizeStorageSegment } from "@/lib/storage/path-builder";
import { createDebugLogger } from "@/lib/debug-logger";

const storageProvider = getStorageProvider();
const routeLogger = createDebugLogger("download-route");

export const runtime = "nodejs";

type DownloadDisposition = "inline" | "attachment";

function isKeyAuthorized(key: string, userId: string): boolean {
  if (!userId) {
    return false;
  }

  const normalizedUserId = normalizeStorageSegment(userId, "anonymous");
  const normalizedKey = key.replace(/^\/+/u, "");
  const segments = normalizedKey.split("/").filter(Boolean);

  if (segments.length < 2) {
    return false;
  }

  const [rootPrefix, ownerId] = segments;
  return rootPrefix === "users" && ownerId === normalizedUserId;
}

function inferContentTypeFromKey(key: string): string {
  const extension = key.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "txt":
      return "text/plain";
    case "json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

function sanitizeFilename(filename: string | undefined): string {
  if (!filename) {
    return "document.bin";
  }
  const sanitized = filename.replace(/[^a-z0-9._-]/gi, "-").replace(/-+/g, "-");
  return sanitized || "document.bin";
}

function resolveDisposition(value: string | null): DownloadDisposition {
  return value === "attachment" ? "attachment" : "inline";
}

function buildContentDisposition(disposition: DownloadDisposition, filename: string): string {
  return `${disposition}; filename="${filename}"`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const dispositionParam = searchParams.get("disposition");
  if (!key) {
    return NextResponse.json({ error: "Missing key parameter" }, { status: 400 });
  }

  const disposition = resolveDisposition(dispositionParam);
  const tokens = await requireServerAuthTokens();
  const userId = tokens.decodedToken.uid;
  if (!isKeyAuthorized(key, userId)) {
    routeLogger.warn("Blocked download attempt for unauthorized key", { key, userId });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const fileBuffer = await storageProvider.download(key);
    const fileBytes = new Uint8Array(fileBuffer);
    const filename = sanitizeFilename(key.split("/").pop());
    const contentType = inferContentTypeFromKey(filename);
    const response = new NextResponse(fileBytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": buildContentDisposition(disposition, filename),
        "Cache-Control": "no-store",
        "Content-Length": fileBuffer.length.toString(),
      },
    });
    return response;
  } catch (error) {
    routeLogger.error("Download failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Unable to download file" }, { status: 500 });
  }
}
