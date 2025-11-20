import "@/lib/polyfills/buffer";
import pino from "pino";
import { env } from "@/env";
import { createDebugLogger } from "@/lib/debug-logger";

const logger = pino({
  level: env.NODE_ENV === "development" ? "debug" : "info",
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
        }
      : undefined,
});

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

  logger.info(
    {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      models: {
        pro: env.GEMINI_PRO_MODEL,
        flash: env.GEMINI_FLASH_MODEL,
        embed: env.GEMINI_EMBED_MODEL,
      },
      retries: env.AI_MAX_RETRIES,
      targetPageCount: env.TARGET_PAGE_COUNT,
    },
    "Server Initialization complete",
  );
  instrumentationLogger.info("Instrumentation register completed");
}
