import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import pdfParse from "pdf-parse";
import { env } from "@/env";
import { buildUserRequestStorageKey, type UserRequestPathInput } from "@/lib/storage/path-builder";
import type { IStorageProvider, StorageUploadResult } from "@/lib/storage/types";
import { createDebugLogger } from "@/lib/debug-logger";
import { getActiveRequestId } from "@/lib/logging/request-id-context";

type UserScopedStorageTarget = UserRequestPathInput & { scope: "user" };
type CustomStorageTarget = { scope: "custom"; key: string };
type StorageTarget = UserScopedStorageTarget | CustomStorageTarget;

type CompileLatexParams = {
  texSource: string;
  storage: StorageTarget;
  maxRetries?: number;
};

type GenerateDocumentParams = {
  content: string;
  storage: StorageTarget;
  contentType?: string;
  metadata?: Record<string, string>;
};

export type CompileResult = {
  success: boolean;
  pageCount: number | null;
  file?: StorageUploadResult;
  attempts: number;
  message?: string;
  error?: Error;
};

const forbiddenLatexPatterns: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\\write18\b/i, reason: "\\write18 is not permitted" },
  { pattern: /\\usepackage\s*\{[^}]*shellesc[^}]*\}/i, reason: "shellesc package is not allowed" },
  { pattern: /\\usepackage\s*\{[^}]*verbatiminput[^}]*\}/i, reason: "verbatim input package is not allowed" },
  { pattern: /\\(openout|openin)\b/i, reason: "Explicit file IO commands are blocked" },
  { pattern: /\\includeonly/i, reason: "Selective include directives are blocked" },
  {
    pattern: /\\(?:input|include)\s*\{[^}]*([/\\]|\.\.)/i,
    reason: "Absolute or parent-directory includes are not allowed",
  },
];

const requestContextDebugEnabled = env.LOG_REQUEST_DEBUG;

function assertSafeLatexSource(texSource: string) {
  for (const rule of forbiddenLatexPatterns) {
    if (rule.pattern.test(texSource)) {
      throw new Error(`Unsafe LaTeX construct detected: ${rule.reason}`);
    }
  }
}

export class DocumentService {
  private readonly targetPageCount = env.TARGET_PAGE_COUNT;
  private readonly latexCmd = env.PDFLATEX_COMMAND;
  private readonly logger = createDebugLogger("document-service");

  constructor(private readonly storage: IStorageProvider) {}

  private traceRequestContext(marker: string, extra?: Record<string, unknown>) {
    if (!requestContextDebugEnabled) {
      return;
    }
    this.logger.data(`request-context::${marker}`, {
      requestId: getActiveRequestId() ?? null,
      ...(extra ?? {}),
    });
  }

  async compileLatexToPdf(params: CompileLatexParams): Promise<CompileResult> {
    const { texSource } = params;
    const maxRetries = params.maxRetries ?? 3;
    const storageKey = this.resolveStorageKey(params.storage);
    this.traceRequestContext("compile-latex", {
      storageScope: params.storage.scope,
      storageKey,
    });
    this.logger.step("compileLatexToPdf invoked", {
      storageScope: params.storage.scope,
      storageKey,
      texLength: texSource.length,
      maxRetries,
    });

    assertSafeLatexSource(texSource);

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      this.logger.step("Starting compile attempt", { attempt });
      try {
        const pdfBuffer = await this.renderLatex(texSource);
        this.logger.step("LaTeX render complete", { attempt, bytes: pdfBuffer.length });
        const pageCount = await this.getPdfPageCount(pdfBuffer);
        this.logger.step("PDF page count computed", { pageCount, target: this.targetPageCount });

        if (pageCount !== this.targetPageCount) {
          lastError = new Error(
            `PDF has ${pageCount} page(s); expected ${this.targetPageCount}`,
          );
          this.logger.warn("Page count mismatch detected", { attempt, pageCount });
          continue;
        }

        const file = await this.storage.upload({
          key: storageKey,
          buffer: pdfBuffer,
          contentType: "application/pdf",
          metadata: { pageCount: String(pageCount) },
        });
        this.logger.info("Uploaded PDF to storage", {
          storageKey,
          pageCount,
          bytes: pdfBuffer.length,
          fileKey: file?.key,
        });

        return {
          success: true,
          pageCount,
          file,
          attempts: attempt,
        };
      } catch (error) {
        lastError = error as Error;
        this.logger.error("Compile attempt failed", {
          attempt,
          error: lastError?.message,
          stack: lastError?.stack,
          texLength: texSource.length,
          texFingerprint: this.computeContentFingerprint(texSource),
        });
      }
    }

    this.logger.error("Exhausted compile retries", {
      maxRetries,
      lastError: lastError?.message,
    });
    return {
      success: false,
      pageCount: null,
      attempts: maxRetries,
      message: lastError?.message,
      error: lastError,
    };
  }

  async renderLatexEphemeral(texSource: string): Promise<{ buffer: Buffer; pageCount: number }> {
    assertSafeLatexSource(texSource);
    const pdfBuffer = await this.renderLatex(texSource);
    const pageCount = await this.getPdfPageCount(pdfBuffer);
    return { buffer: pdfBuffer, pageCount };
  }

  async saveTextArtifact(params: GenerateDocumentParams): Promise<StorageUploadResult> {
    const storageKey = this.resolveStorageKey(params.storage);
    this.traceRequestContext("save-text-artifact", {
      storageScope: params.storage.scope,
      storageKey,
    });
    this.logger.step("Saving text artifact", {
      storageScope: params.storage.scope,
      storageKey,
      contentLength: params.content.length,
      contentType: params.contentType ?? "text/plain",
    });
    return this.storage.upload({
      key: storageKey,
      buffer: Buffer.from(params.content, "utf-8"),
      contentType: params.contentType ?? "text/plain",
      metadata: params.metadata,
    });
  }

  private resolveStorageKey(target: StorageTarget): string {
    if (target.scope === "custom") {
      return target.key;
    }

    return buildUserRequestStorageKey({
      userId: target.userId,
      requestId: target.requestId,
      artifactName: target.artifactName,
      artifactCategory: target.artifactCategory,
      rootPrefix: target.rootPrefix,
    });
  }

  private async renderLatex(texSource: string): Promise<Buffer> {
    this.traceRequestContext("render-latex");
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "cv-latex-"));
    const texPath = path.join(workspace, "main.tex");
    this.logger.step("Created LaTeX workspace", {
      workspace,
      texPath,
      latexCmd: this.latexCmd,
      texLength: texSource.length,
    });

    try {
      await fs.writeFile(texPath, texSource, "utf-8");
      this.logger.step("LaTeX source written", { texPath });

      // Compile twice for stable references (TOC, refs, etc.)
      await this.runLatexPass(workspace, 1);
      await this.runLatexPass(workspace, 2);

      const pdfPath = path.join(workspace, "main.pdf");
      const pdfBuffer = await fs.readFile(pdfPath);
      this.logger.info("pdflatex produced PDF", {
        workspace,
        pdfBytes: pdfBuffer.length,
      });
      return pdfBuffer;
    } finally {
      await fs.rm(workspace, { recursive: true, force: true });
      this.logger.step("Cleaned LaTeX workspace", { workspace });
    }
  }

  private async runLatexPass(cwd: string, pass: number): Promise<void> {
    this.traceRequestContext("run-latex-pass", { pass });
    this.logger.step("Running pdflatex", { cwd, pass, cmd: this.latexCmd });
    const args = ["-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", "main.tex"];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.latexCmd, args, { cwd });
      const stderrChunks: Buffer[] = [];
      const stdoutChunks: Buffer[] = [];

      child.stdout.on("data", (chunk) => {
        stdoutChunks.push(Buffer.from(chunk));
      });

      child.stderr.on("data", (chunk) => {
        stderrChunks.push(Buffer.from(chunk));
        this.logger.data("pdflatex-stderr-bytes", { pass, bytes: chunk.length });
      });
      child.on("error", (error) => {
        this.logger.error("pdflatex spawn error", {
          pass,
          cwd,
          error: error.message,
        });
        reject(error);
      });
      child.on("close", async (code) => {
        if (code === 0) {
          this.logger.step("pdflatex pass succeeded", { pass });
          resolve();
        } else {
          const stderrBuffer = Buffer.concat(stderrChunks);
          const stdoutBuffer = Buffer.concat(stdoutChunks);
          const logPath = path.join(cwd, "main.log");
          const logContent = await this.safeReadFile(logPath);
          const lineNumbers = logContent ? this.extractLatexErrorLines(logContent) : [];

          this.logger.error("pdflatex pass failed", {
            pass,
            code,
            stderrBytes: stderrBuffer.length,
            stdoutBytes: stdoutBuffer.length,
            stderrFingerprint: this.computeContentFingerprint(stderrBuffer),
            stdoutFingerprint: this.computeContentFingerprint(stdoutBuffer),
            logBytes: logContent?.length ?? 0,
            logFingerprint: logContent ? this.computeContentFingerprint(logContent) : null,
            errorLineNumbers: lineNumbers,
          });

          reject(new Error(this.buildLatexFailureMessage(code, lineNumbers)));
        }
      });
    });
  }

  private async getPdfPageCount(buffer: Buffer): Promise<number> {
    this.logger.step("Parsing PDF for page count", { bytes: buffer.length });
    const data = await pdfParse(buffer);
    this.logger.data("pdf-parse-metrics", {
      hasText: Boolean(data.text?.length),
      numpages: typeof data.numpages === "number" ? data.numpages : undefined,
      infoPages: typeof data.info?.Pages === "number" ? data.info.Pages : undefined,
    });
    if (typeof data.numpages === "number") {
      this.logger.step("PDF page count derived from numpages", { numpages: data.numpages });
      return data.numpages;
    }
    if (typeof data.info?.Pages === "number") {
      this.logger.step("PDF page count derived from info.Pages", { pages: data.info.Pages });
      return data.info.Pages;
    }
    throw new Error("Unable to determine PDF page count");
  }

  private computeContentFingerprint(input: string | Buffer | null | undefined): string | null {
    if (input == null) {
      return null;
    }
    const normalized = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
    if (!normalized.length) {
      return null;
    }
    return createHash("sha256").update(normalized).digest("hex");
  }

  private async safeReadFile(filePath: string): Promise<string | null> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return content;
    } catch {
      return null;
    }
  }

  private extractLatexErrorLines(logContent: string, max = 5): number[] {
    const matches = logContent.matchAll(/l\.(\d+)/g);
    const seen = new Set<number>();
    for (const match of matches) {
      const value = Number(match[1]);
      if (!Number.isNaN(value) && !seen.has(value)) {
        seen.add(value);
        if (seen.size >= max) {
          break;
        }
      }
    }
    return Array.from(seen.values());
  }

  private buildLatexFailureMessage(code: number | null, lineNumbers: number[]): string {
    const base = `pdflatex exited with code ${code ?? "unknown"}`;
    if (!lineNumbers.length) {
      return base;
    }
    return `${base}. Check LaTeX content near lines ${lineNumbers.join(", ")}`;
  }
}
