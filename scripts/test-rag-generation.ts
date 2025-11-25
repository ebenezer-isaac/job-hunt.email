
import * as dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local BEFORE importing app code
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  console.log("Testing LlamaIndex integration with Gemini 3...");

  try {
    const { ensureLlamaRuntime } = await import("@/lib/ai/llama/runtime");
    const { Document, VectorStoreIndex, Settings } = await import("llamaindex");

    const { llm, embedModel } = ensureLlamaRuntime();
    
    if (!llm || !embedModel) {
        throw new Error("Failed to initialize Llama runtime");
    }

    console.log("Llama runtime initialized.");
    const resolvedModel = (llm as { model?: string }).model ?? llm.metadata?.model ?? "unknown";
    console.log("Model:", resolvedModel);
    console.log("Metadata:", llm.metadata);

    // Manually set Settings to ensure they are set on the instance we are using
    Settings.llm = llm;
    Settings.embedModel = embedModel;

    // Create a simple index and query it
    const document = new Document({ text: "The capital of France is Paris." });
    const index = await VectorStoreIndex.fromDocuments([document]);
    
    const queryEngine = index.asQueryEngine();
    const response = await queryEngine.query({ query: "What is the capital of France?" });

    console.log("Response:", response.toString());

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error:", message);
  }
}

main();
