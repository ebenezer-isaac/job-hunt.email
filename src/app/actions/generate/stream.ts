const encoder = new TextEncoder();

export type StreamResult = ReadableStream<Uint8Array>;

export function createImmediateStream(message: string): StreamResult {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`${message}\n`));
      controller.close();
    },
  });
}

export function createStreamController() {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  let closed = false;
  // Client navigation can close the WritableStream before we finish emitting server events; quietly ignore that case.
  const isClosedError = (error: unknown) =>
    error instanceof TypeError && typeof error.message === 'string' && error.message.includes('WritableStream is closed');
  const emit = async (message: string) => {
    if (closed) {
      return;
    }
    try {
      await writer.write(encoder.encode(`${message}\n`));
    } catch (error) {
      if (!isClosedError(error)) {
        throw error;
      }
      closed = true;
    }
  };
  const close = async () => {
    if (closed) {
      return;
    }
    closed = true;
    try {
      await writer.close();
    } catch (error) {
      if (!isClosedError(error)) {
        throw error;
      }
    }
  };
  return { readable, emit, close };
}
