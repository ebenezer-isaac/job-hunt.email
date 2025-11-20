import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

declare global {
  // Exposed so isomorphic logger helpers can read the current request scope without
  // bundling this server-only module into client builds.
  var __getActiveRequestId__:
    | undefined
    | (() => string | undefined);
}

export type RequestContext = {
  requestId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

const readActiveRequestId = (): string | undefined => storage.getStore()?.requestId;

if (typeof globalThis !== "undefined" && typeof globalThis.__getActiveRequestId__ !== "function") {
  globalThis.__getActiveRequestId__ = readActiveRequestId;
}

export function runWithRequestIdContext<T>(
  requestId: string | null | undefined,
  callback: () => T,
): T {
  if (!requestId) {
    return callback();
  }
  return storage.run({ requestId }, callback);
}

export function getActiveRequestId(): string | undefined {
  return readActiveRequestId();
}
