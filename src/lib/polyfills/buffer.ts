import { Buffer as SafeBuffer } from "safe-buffer";

declare global {
  var __SAFE_BUFFER_POLYFILL__: boolean | undefined;
}

export function applySafeBufferPolyfill(): void {
  if (globalThis.__SAFE_BUFFER_POLYFILL__) {
    return;
  }
  globalThis.__SAFE_BUFFER_POLYFILL__ = true;
  globalThis.Buffer = SafeBuffer as unknown as BufferConstructor;
}

applySafeBufferPolyfill();
