import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireServerAuthTokens } from "@/lib/auth";
import { sessionRepository } from "@/lib/session";
import { DocumentService } from "@/lib/document-service";
import { getStorageProvider } from "@/lib/storage/types";
import { createDebugLogger } from "@/lib/debug-logger";

const storageProvider = getStorageProvider();
const logger = createDebugLogger("render-pdf-route");
const documentService = new DocumentService(storageProvider);

const schema = z.object({
  sessionId: z.string().min(1),
  artifact: z.literal("cv"),
  generationId: z.string().optional(),
  disposition: z.enum(["inline", "attachment"]).default("inline"),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = schema.safeParse({
    sessionId: searchParams.get("sessionId"),
    artifact: searchParams.get("artifact"),
    generationId: searchParams.get("generationId") ?? undefined,
    disposition: (searchParams.get("disposition") as "inline" | "attachment" | null) ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const { sessionId, artifact, generationId, disposition } = parsed.data;

  const tokens = await requireServerAuthTokens();
  const userId = tokens.decodedToken.uid;

  const session = await sessionRepository.getSession(sessionId);
  if (!session || session.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (artifact !== "cv") {
    return NextResponse.json({ error: "Only CV PDF rendering is supported" }, { status: 400 });
  }

  const cvGenerations = Array.isArray(session.metadata?.cvGenerations)
    ? (session.metadata?.cvGenerations as Array<Record<string, unknown>>)
    : [];
  const selected = generationId
    ? cvGenerations.find((entry) => entry.generationId === generationId)
    : cvGenerations[cvGenerations.length - 1];

  const latex = (selected?.content as string) || (session.metadata?.cvFullLatex as string) || null;
  if (!latex || isRedacted(latex)) {
    return NextResponse.json({ error: "No CV LaTeX available" }, { status: 404 });
  }

  try {
    const { buffer, pageCount } = await documentService.renderLatexEphemeral(latex);
    const arrayBuffer = Uint8Array.from(buffer).buffer;
    logger.step("Rendered CV PDF", { sessionId, generationId: generationId ?? selected?.generationId, pageCount });
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="cv.pdf"`,
        "Cache-Control": "no-store",
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error) {
    logger.error("Render failed", { sessionId, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Failed to render PDF" }, { status: 500 });
  }
}

function isRedacted(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("[REDACTED") || trimmed.includes("reason=latex");
}
