import "server-only";

import { GoogleGenerativeAI, type GenerationConfig, type GenerativeModel } from "@google/generative-ai";

import { env } from "@/env";
import { createDebugLogger } from "@/lib/debug-logger";
import { AIFailureError } from "@/lib/errors/ai-failure-error";

export const MODEL_TYPES = {
  PRO: "pro",
  FLASH: "flash",
} as const;

export type ModelType = (typeof MODEL_TYPES)[keyof typeof MODEL_TYPES];

type JsonGenerationConfig = GenerationConfig & { responseMimeType?: string };

export class ModelClient {
  private readonly genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  private readonly proModel = this.genAI.getGenerativeModel({ model: env.GEMINI_PRO_MODEL });
  private readonly flashModel = this.genAI.getGenerativeModel({ model: env.GEMINI_FLASH_MODEL });
  private readonly maxRetries = env.AI_MAX_RETRIES;
  private readonly initialRetryDelay = env.AI_INITIAL_RETRY_DELAY;
  private readonly logger = createDebugLogger("ai-model-client");

  private getModel(modelType: ModelType): GenerativeModel {
    return modelType === MODEL_TYPES.FLASH ? this.flashModel : this.proModel;
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

  private isRetryableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return message.includes("503") || (message.includes("400") && message.includes("model is overloaded"));
  }

  private async invokeModel(
    prompt: string,
    modelType: ModelType,
    generationConfig?: GenerationConfig,
  ): Promise<string> {
    const model = this.getModel(modelType);
    const result = await model.generateContent({
      contents: this.createContents(prompt),
      generationConfig,
    });
    const response = await result.response;
    const text = response.text();
    this.logger.step("Model response received", { modelType, bytes: text.length });
    return text;
  }

  async generateJsonWithRetry<T>(prompt: string, modelType: ModelType = MODEL_TYPES.PRO): Promise<T> {
    const generationConfig: JsonGenerationConfig = { responseMimeType: "application/json" };

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        this.logger.step("Sending JSON request", { modelType, attempt });
        const rawText = await this.invokeModel(prompt, modelType, generationConfig);
        const cleaned = this.cleanJsonPayload(rawText);
        return JSON.parse(cleaned) as T;
      } catch (error) {
        const syntaxError = error instanceof SyntaxError;
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error("JSON generation failed", {
          attempt,
          modelType,
          error: errorMessage,
          syntaxError,
        });
        if (syntaxError) {
          throw new AIFailureError(`AI JSON service failed: ${errorMessage}`, error, attempt);
        }
        if (this.isRetryableError(error) && attempt < this.maxRetries) {
          this.logger.warn("Retryable JSON generation error", { attempt, delay: this.initialRetryDelay });
          await this.sleep(this.initialRetryDelay);
          continue;
        }
        throw new AIFailureError(`AI JSON service failed: ${errorMessage}`, error, attempt);
      }
    }

    throw new AIFailureError("AI JSON service exhausted retries");
  }

  async generateWithRetry(prompt: string, modelType: ModelType = MODEL_TYPES.PRO): Promise<string> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        this.logger.step("Sending text request", { modelType, attempt });
        return await this.invokeModel(prompt, modelType);
      } catch (error) {
        this.logger.error("Text generation failed", {
          attempt,
          modelType,
          error: error instanceof Error ? error.message : String(error),
        });
        if (this.isRetryableError(error) && attempt < this.maxRetries) {
          this.logger.warn("Retryable text generation error", { attempt, delay: this.initialRetryDelay });
          await this.sleep(this.initialRetryDelay);
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
