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
    } catch (e) {
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
