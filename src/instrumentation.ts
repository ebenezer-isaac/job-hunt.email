import "@/lib/polyfills/buffer";
import { env } from "@/env";
import { createDebugLogger } from "@/lib/debug-logger";

const instrumentationLogger = createDebugLogger("instrumentation");
instrumentationLogger.step("Instrumentation module initialized", {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
});

export async function register() {
  instrumentationLogger.step("register() invoked", { runtime: process.env.NEXT_RUNTIME });
  if (process.env.NEXT_RUNTIME === "edge") {
    instrumentationLogger.warn("Skipping instrumentation on edge runtime");
    return;
  }

  // Ensure server-side logging writer is initialized
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/logging/server-writer-bootstrap");
  }

  instrumentationLogger.info("Server Initialization complete", {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    models: {
      pro: env.GEMINI_PRO_MODEL,
      flash: env.GEMINI_FLASH_MODEL,
      embed: env.GEMINI_EMBED_MODEL,
    },
    retries: env.AI_MAX_RETRIES,
    targetPageCount: env.TARGET_PAGE_COUNT,
  });
  instrumentationLogger.info("Instrumentation register completed");
}
