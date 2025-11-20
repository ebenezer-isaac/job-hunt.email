import { NextRequest } from "next/server";
import { generateDocumentsAction } from "@/app/actions/generate";
import { createDebugLogger, REQUEST_ID_HEADER } from "@/lib/debug-logger";
import { runWithRequestIdContext } from "@/lib/logging/request-id-context";

const logger = createDebugLogger("api-generate");
logger.step("Generation API route ready");

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const requestId = request.headers.get(REQUEST_ID_HEADER);
  logger.step("Handling generate POST", {
    requestId: requestId ?? null,
    contentLength: request.headers.get("content-length"),
  });
  return runWithRequestIdContext(requestId, async () => {
    try {
      const formData = await request.formData();
      logger.step("Incoming generation request", {
        keys: Array.from(formData.keys()),
        requestId: requestId ?? null,
      });

      const { stream } = await generateDocumentsAction(formData, { requestId: requestId ?? undefined });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      logger.error("Generation route failed", {
        requestId: requestId ?? null,
        error,
      });
      const message =
        error instanceof Error ? error.message : "Unknown error while processing request";
      return new Response(`Generation failed: ${message}`, { status: 500 });
    }
  });
}
