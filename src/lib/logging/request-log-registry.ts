import "server-only";
import "@/lib/logging/server-writer-bootstrap";

export type RequestLogContext = {
  companyName?: string;
  jobTitle?: string;
  sessionId?: string;
  mode?: string;
  createdAt: string;
};

type RegisterPayload = Omit<RequestLogContext, "createdAt"> & { createdAt?: string };

const CONTEXT_TTL_MS = 1000 * 60 * 30; // 30 minutes
const contexts = new Map<string, RequestLogContext>();
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function registerRequestLogContext(requestId: string, payload: RegisterPayload): void {
  if (!requestId) {
    return;
  }
  const context: RequestLogContext = {
    companyName: payload.companyName,
    jobTitle: payload.jobTitle,
    sessionId: payload.sessionId,
    mode: payload.mode,
    createdAt: payload.createdAt ?? new Date().toISOString(),
  };
  contexts.set(requestId, context);
  const existingTimer = cleanupTimers.get(requestId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  const timer = setTimeout(() => {
    contexts.delete(requestId);
    cleanupTimers.delete(requestId);
  }, CONTEXT_TTL_MS);
  if (typeof timer.unref === "function") {
    timer.unref();
  }
  cleanupTimers.set(requestId, timer);
}

export function getRequestLogContext(requestId: string): RequestLogContext | undefined {
  if (!requestId) {
    return undefined;
  }
  return contexts.get(requestId);
}
