import "server-only";

import { GoogleGenerativeAI, type GenerationConfig, type GenerativeModel, type Tool } from "@google/generative-ai";

import { env } from "@/env";
import { createDebugLogger } from "@/lib/debug-logger";
import { AIFailureError } from "@/lib/errors/ai-failure-error";

export const MODEL_TYPES = {
  PRO: "pro",
  FLASH: "flash",
  THINKING: "thinking",
} as const;

export type ModelType = (typeof MODEL_TYPES)[keyof typeof MODEL_TYPES];

type JsonGenerationConfig = GenerationConfig & { responseMimeType?: string };

export class ModelClient {
  private readonly genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  private readonly proModel = this.genAI.getGenerativeModel({ model: env.GEMINI_PRO_MODEL });
  private readonly fallbackProModel = this.genAI.getGenerativeModel({ model: env.GEMINI_PRO_FALLBACK_MODEL });
  private readonly flashModel = this.genAI.getGenerativeModel({ model: env.GEMINI_FLASH_MODEL });
  private readonly maxRetries = env.AI_MAX_RETRIES;
  private readonly initialRetryDelay = env.AI_INITIAL_RETRY_DELAY;
  private readonly logger = createDebugLogger("ai-model-client");
  private readonly modelLimitCache = new Map<string, Promise<number | null>>();

  private readonly overloadFallbackThreshold = 3;

  private getModel(modelType: ModelType, useFallbackPro = false): GenerativeModel {
    switch (modelType) {
      case MODEL_TYPES.FLASH:
        return this.flashModel;
      case MODEL_TYPES.THINKING:
      case MODEL_TYPES.PRO:
      default:
        if (useFallbackPro && modelType === MODEL_TYPES.PRO) {
          return this.fallbackProModel;
        }
        return this.proModel;
    }
  }

  private createContents(prompt: string) {
    return [{
      role: "user" as const,
      parts: [{ text: prompt }],
    }];
  }

  private cleanJsonPayload(payload: string): string {
    const match = payload.match(/\{[\s\S]*\}/);
    return match ? match[0] : payload;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizeErrorMessage(error: unknown): string {
    if (typeof error === "string") {
      return error.toLowerCase();
    }
    if (error instanceof Error) {
      return (error.message ?? "").toLowerCase();
    }
    return String(error ?? "").toLowerCase();
  }

  private isRetryableError(error: unknown): boolean {
    const message = this.normalizeErrorMessage(error);
    return (
      message.includes("503") ||
      message.includes("429") ||
      message.includes("resource_exhausted") ||
      message.includes("deadline exceeded") ||
      message.includes("timeout") ||
      (message.includes("400") && message.includes("model is overloaded"))
    );
  }

  private isServiceUnavailableError(error: unknown): boolean {
    const message = this.normalizeErrorMessage(error);
    return message.includes("503") || message.includes("service unavailable");
  }

  private describeTransport(modelType: ModelType, useFallbackPro: boolean): string {
    if (modelType === MODEL_TYPES.PRO && useFallbackPro) {
      return "legacy-pro";
    }
    return modelType;
  }

  private async invokeModel(
    prompt: string,
    modelType: ModelType,
    generationConfig?: GenerationConfig,
    tools?: Tool[],
    useFallbackPro = false,
  ): Promise<string> {
    const model = this.getModel(modelType, useFallbackPro);
    const transport = this.describeTransport(modelType, useFallbackPro);
    const modelName = this.getModelName(modelType, useFallbackPro);
    const contents = this.createContents(prompt);
    
    // Gemini 3 Best Practices:
    // 1. Use default temperature (1.0) for reasoning models
    const config = { ...generationConfig };
    
    // Explicitly set thinking level for THINKING tasks, though Gemini 3 defaults to high/dynamic
    if (modelType === MODEL_TYPES.THINKING) {
       // thinking_level removed as it causes 400 Bad Request with current API
    }

    await this.logPromptTokenEstimate(contents, model, modelType, transport, modelName);

    const result = await model.generateContent({
      contents,
      generationConfig: config,
      tools,
    });
    const response = await result.response;
    const text = response.text();
    this.logger.step("Model response received", { modelType, transport, bytes: text.length });
    return text;
  }

  private async logPromptTokenEstimate(
    contents: ReturnType<typeof this.createContents>,
    model: GenerativeModel,
    modelType: ModelType,
    transport: string,
    modelName: string | null,
  ): Promise<void> {
    try {
      const tokenInfo = await model.countTokens({ contents });
      const totalTokens = tokenInfo.totalTokens ?? 0;
      const limit = modelName ? await this.getModelInputTokenLimit(modelName) : null;
      this.logger.step("Prompt token estimate", {
        modelType,
        transport,
        modelName,
        tokens: totalTokens,
        limit,
        remaining: typeof limit === "number" ? limit - totalTokens : undefined,
      });
    } catch (error) {
      this.logger.warn("Prompt token count failed", {
        modelType,
        transport,
        modelName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private getModelName(modelType: ModelType, useFallbackPro: boolean): string | null {
    if (modelType === MODEL_TYPES.FLASH) {
      return env.GEMINI_FLASH_MODEL;
    }
    if (modelType === MODEL_TYPES.PRO) {
      return useFallbackPro ? env.GEMINI_PRO_FALLBACK_MODEL : env.GEMINI_PRO_MODEL;
    }
    if (modelType === MODEL_TYPES.THINKING) {
      return env.GEMINI_PRO_MODEL;
    }
    return null;
  }

  private async getModelInputTokenLimit(modelName: string): Promise<number | null> {
    if (!modelName) {
      return null;
    }
    let cachedPromise = this.modelLimitCache.get(modelName);
    if (!cachedPromise) {
      cachedPromise = this.fetchModelInputTokenLimit(modelName);
      this.modelLimitCache.set(modelName, cachedPromise);
    }
    return cachedPromise;
  }

  private async fetchModelInputTokenLimit(modelName: string): Promise<number | null> {
    try {
      const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}`);
      url.searchParams.set("key", env.GEMINI_API_KEY);
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn("Failed to fetch model metadata", {
          modelName,
          status: response.status,
          statusText: response.statusText,
        });
        return null;
      }
      const metadata = (await response.json()) as Record<string, unknown>;
      const rawLimit = metadata.inputTokenLimit ?? metadata.input_token_limit ?? null;
      const limit = typeof rawLimit === "number" ? rawLimit : Number(rawLimit);
      if (Number.isFinite(limit)) {
        return limit;
      }
      this.logger.warn("Input token limit missing in model metadata", {
        modelName,
        metadata,
      });
      return null;
    } catch (error) {
      this.logger.warn("Model metadata request failed", {
        modelName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async generateJsonWithRetry<T>(prompt: string, modelType: ModelType = MODEL_TYPES.PRO, tools?: Tool[]): Promise<T> {
    const generationConfig: JsonGenerationConfig | undefined = tools?.length
      ? undefined // Gemini rejects responseMimeType when tool calling is enabled
      : { responseMimeType: "application/json" };

    let attempt = 1;
    let useFallbackPro = false;
    let overloadCount = 0;

    while (attempt <= this.maxRetries) {
      try {
        const transport = this.describeTransport(modelType, useFallbackPro);
        this.logger.step("Sending JSON request", { modelType, attempt, transport });
        const rawText = await this.invokeModel(prompt, modelType, generationConfig, tools, useFallbackPro);
        const cleaned = this.cleanJsonPayload(rawText);
        return JSON.parse(cleaned) as T;
      } catch (error) {
        const syntaxError = error instanceof SyntaxError;
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error("JSON generation failed", {
          attempt,
          modelType,
          transport: this.describeTransport(modelType, useFallbackPro),
          error: errorMessage,
          syntaxError,
        });
        if (!useFallbackPro && modelType === MODEL_TYPES.PRO && this.isServiceUnavailableError(error)) {
          overloadCount += 1;
          this.logger.warn("Gemini 3 reported 503", {
            attempt,
            overloadCount,
            threshold: this.overloadFallbackThreshold,
          });
          if (overloadCount >= this.overloadFallbackThreshold) {
            useFallbackPro = true;
            this.logger.warn("Switching to Gemini 2.5 Pro fallback", {
              attempt,
              promptBytes: prompt.length,
            });
            continue;
          }
        }
        if (syntaxError) {
          throw new AIFailureError(`AI JSON service failed: ${errorMessage}`, error, attempt);
        }
        if (this.isRetryableError(error) && attempt < this.maxRetries) {
          this.logger.warn("Retryable JSON generation error", {
            attempt,
            delay: this.initialRetryDelay,
            transport: this.describeTransport(modelType, useFallbackPro),
          });
          await this.sleep(this.initialRetryDelay);
          attempt += 1;
          continue;
        }
        throw new AIFailureError(`AI JSON service failed: ${errorMessage}`, error, attempt);
      }
    }

    throw new AIFailureError("AI JSON service exhausted retries");
  }

  async generateWithRetry(prompt: string, modelType: ModelType = MODEL_TYPES.PRO, tools?: Tool[]): Promise<string> {
    let attempt = 1;
    let useFallbackPro = false;
    let overloadCount = 0;

    while (attempt <= this.maxRetries) {
      try {
        const transport = this.describeTransport(modelType, useFallbackPro);
        this.logger.step("Sending text request", { modelType, attempt, transport });
        return await this.invokeModel(prompt, modelType, undefined, tools, useFallbackPro);
      } catch (error) {
        this.logger.error("Text generation failed", {
          attempt,
          modelType,
          transport: this.describeTransport(modelType, useFallbackPro),
          error: error instanceof Error ? error.message : String(error),
        });
        if (!useFallbackPro && modelType === MODEL_TYPES.PRO && this.isServiceUnavailableError(error)) {
          overloadCount += 1;
          this.logger.warn("Gemini 3 reported 503", {
            attempt,
            overloadCount,
            threshold: this.overloadFallbackThreshold,
          });
          if (overloadCount >= this.overloadFallbackThreshold) {
            useFallbackPro = true;
            this.logger.warn("Switching to Gemini 2.5 Pro fallback", {
              attempt,
              promptBytes: prompt.length,
            });
            continue;
          }
        }
        if (this.isRetryableError(error) && attempt < this.maxRetries) {
          this.logger.warn("Retryable text generation error", {
            attempt,
            delay: this.initialRetryDelay,
            transport: this.describeTransport(modelType, useFallbackPro),
          });
          await this.sleep(this.initialRetryDelay);
          attempt += 1;
          continue;
        }
        throw new AIFailureError(
          `AI text service failed: ${error instanceof Error ? error.message : String(error)}`,
          error,
          attempt,
        );
      }
    }
    throw new AIFailureError("AI text service exhausted retries");
  }
}
