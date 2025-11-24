import { CallbackManager, Settings } from "llamaindex";
import {
  GEMINI_EMBEDDING_MODEL,
  GEMINI_MODEL,
  Gemini,
  GeminiEmbedding,
} from "@llamaindex/google";
import { env } from "@/env";
import { createDebugLogger } from "@/lib/debug-logger";

const logger = createDebugLogger("llama-runtime");

// Subclass Gemini to handle unknown models (like gemini-3-pro-preview)
// that are not yet in the library's metadata registry.
class GeminiCustom extends Gemini {
  get metadata() {
    try {
      return super.metadata;
    } catch (error) {
      logger.warn("llama-runtime-metadata-fallback", {
        model: this.model,
        reason: error instanceof Error ? error.message : String(error),
      });
      // Fallback for unknown models
      return {
        model: this.model,
        temperature: this.temperature,
        topP: this.topP ?? 1,
        contextWindow: 2000000, // 2M context window for Gemini 1.5 Pro / 3
        tokenizer: undefined,
        structuredOutput: true,
        safetySettings: [],
      };
    }
  }
}

let llm: Gemini | null = null;
let embedModel: GeminiEmbedding | null = null;
let initialized = false;

const GEMINI_MODEL_VALUES = Object.values(GEMINI_MODEL) as string[];
const GEMINI_EMBED_MODEL_VALUES = Object.values(GEMINI_EMBEDDING_MODEL) as string[];
const GEMINI_OVERLOAD_FALLBACK_THRESHOLD = 1;

function resolveEnumValue<T extends string>(
  value: string | undefined,
  validValues: readonly string[],
  fallback: T,
  envKey: string,
): T {
  // Allow gemini-3-pro-preview explicitly even if not in the enum yet
  if (value === "gemini-3-pro-preview") {
    return value as T;
  }
  if (value && validValues.includes(value)) {
    return value as T;
  }
  logger.warn("Invalid %s provided; falling back", { envKey, value, fallback });
  return fallback;
}

function createLlamaCallbackManager(): CallbackManager | null {
  if (!env.LLAMAINDEX_TRACING_ENABLED) {
    return null;
  }

  const callbackManager = new CallbackManager();
  callbackManager.on("llm-start", (event) => {
    logger.step("llm-start", {
      id: event.detail.id,
      messages: event.detail.messages.length,
    });
  });
  callbackManager.on("llm-end", (event) => {
    logger.step("llm-end", {
      id: event.detail.id,
      responseLength: event.detail.response?.message?.content?.length ?? 0,
    });
  });
  callbackManager.on("llm-tool-call", (event) => {
    logger.data("llm-tool-call", {
      tool: event.detail.toolCall.name,
    });
  });
  callbackManager.on("llm-tool-result", (event) => {
    logger.data("llm-tool-result", {
      tool: event.detail.toolCall.name,
      isError: event.detail.toolResult.isError,
    });
  });

  return callbackManager;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error.toLowerCase();
  }
  if (error instanceof Error) {
    return (error.message ?? "").toLowerCase();
  }
  return String(error ?? "").toLowerCase();
}

function isRetryableError(error: unknown): boolean {
  const message = normalizeErrorMessage(error);
  return (
    message.includes("503") ||
    message.includes("429") ||
    message.includes("resource_exhausted") ||
    message.includes("deadline exceeded") ||
    message.includes("timeout") ||
    (message.includes("400") && message.includes("model is overloaded"))
  );
}

function isServiceUnavailableError(error: unknown): boolean {
  const message = normalizeErrorMessage(error);
  return message.includes("503") || message.includes("service unavailable");
}

function wrapGeminiWithFallback(llmInstance: GeminiCustom, fallbackModel: GEMINI_MODEL): GeminiCustom {
  if (!fallbackModel || fallbackModel === llmInstance.model) {
    return llmInstance;
  }

  const fallbackInstance = new GeminiCustom({
    apiKey: env.GEMINI_API_KEY,
    model: fallbackModel,
    temperature: llmInstance.temperature,
    topP: llmInstance.topP,
    maxTokens: llmInstance.maxTokens,
    safetySettings: llmInstance.safetySettings,
  });

  const maxRetries = env.AI_MAX_RETRIES;
  const initialRetryDelay = env.AI_INITIAL_RETRY_DELAY;

  const executeWithFallback = async <T>(
    operationName: string,
    executor: (useFallback: boolean) => Promise<T>,
  ): Promise<T> => {
    let attempt = 1;
    let overloadCount = 0;
    let useFallback = false;

    while (attempt <= maxRetries) {
      try {
        const transport = useFallback ? "fallback" : "primary";
        logger.step(`llama-${operationName}-start`, {
          attempt,
          transport,
          model: useFallback ? fallbackInstance.model : llmInstance.model,
        });
        return await executor(useFallback);
      } catch (error) {
        const transport = useFallback ? "fallback" : "primary";
        logger.error(`llama-${operationName}-failed`, {
          attempt,
          transport,
          model: useFallback ? fallbackInstance.model : llmInstance.model,
          error: error instanceof Error ? error.message : String(error),
        });

        if (!useFallback && isServiceUnavailableError(error)) {
          overloadCount += 1;
          logger.warn("llama-gemini-overload", {
            attempt,
            overloadCount,
            threshold: GEMINI_OVERLOAD_FALLBACK_THRESHOLD,
          });
          if (overloadCount >= GEMINI_OVERLOAD_FALLBACK_THRESHOLD) {
            useFallback = true;
            logger.warn("llama-switching-gemini-fallback", {
              attempt,
              primaryModel: llmInstance.model,
              fallbackModel: fallbackInstance.model,
            });
            continue;
          }
        }

        if (isRetryableError(error) && attempt < maxRetries) {
          logger.warn("llama-gemini-retrying", {
            attempt,
            delay: initialRetryDelay,
            transport,
          });
          await sleep(initialRetryDelay);
          attempt += 1;
          continue;
        }

        throw error;
      }
    }

    throw new Error("Gemini runtime exhausted retries");
  };

  const wrapMethod = (methodName: "chat" | "complete") => {
    const primaryMethod = (llmInstance[methodName] as (...args: unknown[]) => Promise<unknown>).bind(llmInstance);
    const fallbackMethod = (fallbackInstance[methodName] as (...args: unknown[]) => Promise<unknown>).bind(
      fallbackInstance,
    );

    const wrappedMethod = (...args: unknown[]) =>
      executeWithFallback(methodName, (useFallback) =>
        (useFallback ? fallbackMethod : primaryMethod)(...args),
      );

    // Reflect avoids fighting TypeScript's overload signatures while swapping the runtime method.
    Reflect.set(llmInstance, methodName, wrappedMethod);
  };

  wrapMethod("chat");
  wrapMethod("complete");

  return llmInstance;
}

export function ensureLlamaRuntime() {
  if (initialized && llm && embedModel) {
    return { llm, embedModel };
  }

  const selectedGeminiModel = resolveEnumValue(
    env.GEMINI_PRO_MODEL,
    GEMINI_MODEL_VALUES,
    GEMINI_MODEL.GEMINI_2_5_PRO_LATEST,
    "GEMINI_PRO_MODEL",
  );

  const selectedFallbackModel = resolveEnumValue(
    env.GEMINI_PRO_FALLBACK_MODEL,
    GEMINI_MODEL_VALUES,
    selectedGeminiModel,
    "GEMINI_PRO_FALLBACK_MODEL",
  );

  const selectedGeminiEmbedModel = resolveEnumValue(
    env.GEMINI_EMBED_MODEL,
    GEMINI_EMBED_MODEL_VALUES,
    GEMINI_EMBEDDING_MODEL.TEXT_EMBEDDING_004,
    "GEMINI_EMBED_MODEL",
  );

  llm = new GeminiCustom({
    apiKey: env.GEMINI_API_KEY,
    model: selectedGeminiModel,
    temperature: 0.2,
  });

  if (selectedFallbackModel && selectedFallbackModel !== selectedGeminiModel) {
    llm = wrapGeminiWithFallback(llm as GeminiCustom, selectedFallbackModel);
  }

  embedModel = new GeminiEmbedding({
    apiKey: env.GEMINI_API_KEY,
    model: selectedGeminiEmbedModel,
  });

  const callbackManager = createLlamaCallbackManager();

  Settings.llm = llm;
  Settings.embedModel = embedModel;
  if (callbackManager) {
    Settings.callbackManager = callbackManager;
  }

  initialized = true;
  logger.step("runtime-ready", {
    model: selectedGeminiModel,
    embedModel: selectedGeminiEmbedModel,
    tracing: Boolean(callbackManager),
  });

  return { llm, embedModel };
}
