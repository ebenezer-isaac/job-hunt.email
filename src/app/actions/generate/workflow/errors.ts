export class RequestAbortedError extends Error {
  constructor(message = "REQUEST_ABORTED") {
    super(message);
    this.name = "RequestAbortedError";
  }
}

export function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new RequestAbortedError();
  }
}

export function describeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: typeof error, message: String(error), stack: undefined };
}

export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return true;
  }
  if (error instanceof Error) {
    return error.name === "AbortError" || error.message === "REQUEST_ABORTED";
  }
  return false;
}

export function describeCvCompilationError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const pageMatch = rawMessage.match(/PDF has (\d+) page/);
  if (pageMatch) {
    const pages = Number(pageMatch[1]);
    return `CV PDF still has ${pages} page(s) instead of the target 2-page format. Tweaking the content and retrying usually fixes this.`;
  }
  if (rawMessage.toLowerCase().includes("pdflatex")) {
    return "CV PDF compilation failed due to a LaTeX formatting error. Please try again in a minute.";
  }
  return `CV PDF compilation failed: ${rawMessage}`;
}