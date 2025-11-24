
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_PRO_MODEL || "gemini-3-pro-preview";

if (!apiKey) {
  console.error("Error: GEMINI_API_KEY is not set in .env.local");
  process.exit(1);
}

console.log(`Testing generation with model: ${modelName}`);

async function testGeneration() {
  const genAI = new GoogleGenerativeAI(apiKey!);
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = "Explain the concept of quantum entanglement in simple terms.";

  console.log("\n--- Attempt 1: With thinking_level = 'high' ---");
  try {
    const experimentalThinkingConfig = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        thinking_level: "high",
      },
    } as Parameters<typeof model.generateContent>[0];

    const result = await model.generateContent(experimentalThinkingConfig);
    const response = await result.response;
    console.log("Success! Response length:", response.text().length);
    console.log("Snippet:", response.text().substring(0, 100));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed:", message);
  }

  console.log("\n--- Attempt 2: Without thinking_level ---");
  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const response = await result.response;
    console.log("Success! Response length:", response.text().length);
    console.log("Snippet:", response.text().substring(0, 100));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed:", message);
  }
  
  console.log("\n--- Attempt 3: With thinkingConfig (Alternative API) ---");
  try {
    // Some versions use thinkingConfig object
    const experimentalThinkingConfig = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      thinkingConfig: {
        includeThoughts: true,
      },
    } as Parameters<typeof model.generateContent>[0];

    const result = await model.generateContent(experimentalThinkingConfig);
    const response = await result.response;
    console.log("Success! Response length:", response.text().length);
    console.log("Snippet:", response.text().substring(0, 100));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed:", message);
  }
}

testGeneration().catch(console.error);
