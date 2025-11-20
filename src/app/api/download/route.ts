import { NextRequest, NextResponse } from "next/server";
import { requireServerAuthTokens } from "@/lib/auth";
import { getStorageProvider } from "@/lib/storage/types";
import { createDebugLogger } from "@/lib/debug-logger";

const storageProvider = getStorageProvider();
const routeLogger = createDebugLogger("download-route");

export const runtime = "nodejs";

function isKeyAuthorized(key: string, userId: string): boolean {
  return key.startsWith(`users/${userId}/`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "Missing key parameter" }, { status: 400 });
  }

  const tokens = await requireServerAuthTokens();
  const userId = tokens.decodedToken.uid;
  if (!isKeyAuthorized(key, userId)) {
    routeLogger.warn("Blocked download attempt for unauthorized key", { key, userId });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const fileBuffer = await storageProvider.download(key);
    const fileBytes = new Uint8Array(fileBuffer);
    const filename = key.split("/").pop() ?? "document.bin";
    const response = new NextResponse(fileBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
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
