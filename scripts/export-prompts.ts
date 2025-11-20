#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";
import ts from "typescript";

import { getScriptLogger } from "./logger";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const sourcePath = path.resolve(projectRoot, "src/lib/ai/prompts.ts");
const outputPath = path.resolve(projectRoot, "src/prompts.json");
const isDev = process.env.NODE_ENV ? process.env.NODE_ENV !== "production" : true;
loadEnvConfig(projectRoot, isDev);

const metadata = {
  extractJobDescription: {
    workflow: "job_ingestion",
    description: "Removes navigation noise and isolates the job description copy from scraped pages.",
  },
  extractJobDetails: {
    workflow: "job_ingestion",
    description: "Parses company name and job title from a structured job description using a strict JSON schema.",
  },
  generateCVAdvanced: {
    workflow: "cv_generation",
    description: "Produces a two-page LaTeX CV tailored to the role while weaving in research insights and strategy guidance.",
  },
  fixCVTooLong: {
    workflow: "cv_validation",
    description: "Shortens LaTeX CV output so the PDF compiles to the expected page count without truncating content.",
  },
  fixCVTooShort: {
    workflow: "cv_validation",
    description: "Expands LaTeX CV output when the PDF is under the required page count by enriching relevant bullets.",
  },
  generateCoverLetterAdvanced: {
    workflow: "cover_letter",
    description: "Writes a one-page cover letter grounded in the tailored CV, strategies, and research brief.",
  },
  refineContentAdvanced: {
    workflow: "refinement",
    description: "Applies user feedback to an existing artifact while preserving layout heuristics and context.",
  },
  generateCVChangeSummary: {
    workflow: "analysis",
    description: "Compares original and tailored CVs to summarize notable content changes.",
  },
  researchCompanyAndIdentifyPeople: {
    workflow: "research",
    description: "Synthesizes deep company intel, decision makers, and strategic insights for outreach.",
  },
  generatePersonalizedColdEmail: {
    workflow: "cold_outreach",
    description: "Drafts a hyper-personalized cold email when a verified contact is available.",
  },
  generateGenericColdEmail: {
    workflow: "cold_outreach",
    description: "Drafts a cold email to a company when no named contact exists.",
  },
  parseColdOutreachInput: {
    workflow: "input_parsing",
    description: "Extracts company, person, and role targets from free-form cold outreach text.",
  },
  getIntelligence: {
    workflow: "research",
    description: "Infers likely job titles for a target person at a company.",
  },
  processJobURL: {
    workflow: "job_ingestion",
    description: "Fetches and structures job posting data directly from a URL.",
  },
  processJobText: {
    workflow: "job_ingestion",
    description: "Structures raw pasted job description text into JSON.",
  },
} as const;

type PromptCatalogShape = Record<string, { variables: Set<string>; template: string }>;
type PromptExport = Record<
  string,
  {
    workflow: string;
    description: string;
    variables: string[];
    template: string;
  }
>;

async function run(): Promise<void> {
  const logger = getScriptLogger("export-prompts");
  try {
    const promptCatalog =
      extractCatalogFromTypeScript(logger) ?? loadCatalogFromJson(logger) ?? (() => {
        throw new Error("Unable to load prompt catalog from TypeScript or JSON");
      })();

    const output: PromptExport = Object.entries(promptCatalog).reduce((acc, [key, value]) => {
      const meta = metadata[key as keyof typeof metadata] ?? { workflow: "unspecified", description: "" };
      acc[key] = {
        workflow: meta.workflow,
        description: meta.description,
        variables: Array.from(value.variables),
        template: value.template,
      };
      return acc;
    }, {} as PromptExport);

    writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    logger.info("Prompt catalog exported", {
      outputPath,
      promptCount: Object.keys(output).length,
    });
  } catch (error) {
    logger.error("Prompt catalog export failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

run().catch(() => {
  process.exitCode = 1;
});

function extractCatalogFromTypeScript(logger: ReturnType<typeof getScriptLogger>): PromptCatalogShape | null {
  try {
    const source = readFileSync(sourcePath, "utf8");
    logger.step("Loaded prompt source", { sourcePath, bytes: source.length });

    const instrumentedSource = `${source}\n;(globalThis as any).__PROMPT_EXPORT__ = promptCatalog;`;
    const transpiled = ts.transpileModule(instrumentedSource, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: sourcePath,
      reportDiagnostics: true,
    });
    logger.step("Transpiled prompt module", {
      diagnostics: transpiled.diagnostics?.length ?? 0,
    });

    const script = new vm.Script(transpiled.outputText, { filename: sourcePath });
    const moduleDir = path.dirname(sourcePath);
    const moduleRequire = createRequire(sourcePath);
    const sandbox: Record<string, unknown> = {
      exports: {},
      module: { exports: {} },
      require: (specifier: string) => {
        if (specifier === "server-only") {
          return {};
        }
        return moduleRequire(specifier);
      },
      __dirname: moduleDir,
      __filename: sourcePath,
      console,
      process,
      globalThis: {},
    };

    sandbox.global = sandbox;
    sandbox.globalThis = sandbox;

    script.runInNewContext(sandbox);
    const extracted = (sandbox as { __PROMPT_EXPORT__?: PromptCatalogShape }).__PROMPT_EXPORT__;
    if (!extracted) {
      logger.warn("prompts.ts did not expose a catalog; falling back to JSON");
      return null;
    }
    return extracted;
  } catch (error) {
    logger.warn("Failed to extract prompts from TypeScript", {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function loadCatalogFromJson(logger: ReturnType<typeof getScriptLogger>): PromptCatalogShape | null {
  if (!existsSync(outputPath)) {
    logger.warn("prompt JSON file missing", { outputPath });
    return null;
  }
  try {
    const raw = readFileSync(outputPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, { variables: string[]; template: string }>;
    logger.step("Loaded fallback prompt catalog from JSON", {
      outputPath,
      promptCount: Object.keys(parsed).length,
    });
    return Object.entries(parsed).reduce((acc, [key, value]) => {
      acc[key] = {
        variables: new Set(value.variables ?? []),
        template: value.template,
      };
      return acc;
    }, {} as PromptCatalogShape);
  } catch (error) {
    logger.error("Failed to parse fallback prompt JSON", {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
