import { NextResponse } from "next/server";
import { DocumentService } from "@/lib/document-service";
import { buildSmokeTestStorageKey } from "@/lib/storage/path-builder";
import { getStorageProvider } from "@/lib/storage/types";
import { createDebugLogger } from "@/lib/debug-logger";
import { requireServerAuthTokens } from "@/lib/auth";
import { env } from "@/env";

const storage = getStorageProvider();
const documentService = new DocumentService(storage);
const logger = createDebugLogger("api-smoke-latex");
logger.step("Smoke latex route ready", {
  allowlistSize: env.SMOKE_TEST_ALLOWED_EMAILS ? env.SMOKE_TEST_ALLOWED_EMAILS.split(",").length : 0,
});

function getAllowlistedEmails(): Set<string> {
  return new Set(
    env.SMOKE_TEST_ALLOWED_EMAILS
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function POST() {
  const allowlist = getAllowlistedEmails();
  if (!allowlist.size) {
    logger.warn("Smoke test endpoint disabled: empty allowlist");
    return NextResponse.json(
      { ok: false, message: "Smoke test endpoint is disabled" },
      { status: 403 },
    );
  }

  const tokens = await requireServerAuthTokens().catch(() => null);
  if (!tokens) {
    logger.warn("Smoke test request rejected: unauthenticated");
    return NextResponse.json(
      { ok: false, message: "Authentication required" },
      { status: 401 },
    );
  }

  const email = tokens.decodedToken.email?.toLowerCase() ?? "";
  if (!allowlist.has(email)) {
    logger.warn("Smoke test request rejected: not allowlisted", { email });
    return NextResponse.json(
      { ok: false, message: "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    logger.step("Smoke test timestamp computed", { timestamp });
    const texSource = `\\documentclass{article}
  \\usepackage[margin=1in]{geometry}
  \\begin{document}
  \\section*{CV Customiser Smoke Test}
  This document was generated at ${timestamp} to validate pdflatex + Firebase Storage integration.\\newline
  \\newline
  Page one content repeated multiple times to force two pages.\\newline\\newline
  ${"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(50)}
  \\newpage
  \\section*{Second Page}
  If you can download the PDF via the signed URL returned by the API, the pipeline is working end-to-end.
  \\end{document}`;
    logger.data("tex-source", texSource);

    const storageKey = buildSmokeTestStorageKey(timestamp);
    const result = await documentService.compileLatexToPdf({
      texSource,
      storage: { scope: "custom", key: storageKey },
      maxRetries: 1,
    });
    logger.data("compile-result", result);

    if (!result.success || !result.file) {
      logger.error("DocumentService returned failure", result);
      return NextResponse.json(
        {
          ok: false,
          message: result.message ?? "Unexpected compile failure",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      pageCount: result.pageCount,
      url: result.file.url,
      storageKey: result.file.key,
    });
  } catch (error) {
    logger.error("Smoke test failed", error);
    return NextResponse.json(
      {
        ok: false,
        message: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
