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
  const emit = async (message: string) => {
    await writer.write(encoder.encode(`${message}\n`));
  };
  const close = async () => {
    await writer.close();
  };
  return { readable, emit, close };
}
