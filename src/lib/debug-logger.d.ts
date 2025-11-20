import type { LogTransport } from "./logging/types";

type LogFn = (message: string, payload?: unknown) => void;
type DataFn = (label: string, payload: unknown) => void;

export type DebugLogger = {
  step: LogFn;
  data: DataFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  withRequestId: (requestId: string) => DebugLogger;
};

export type LoggerOptions = {
  requestId?: string;
  transport?: LogTransport | null;
};

export const LOG_ENDPOINT_PATH: string;
export const REQUEST_ID_HEADER: string;

export function createDebugLogger(scope: string, options?: LoggerOptions): DebugLogger;
export function createHttpLogTransport(origin: string): LogTransport;
export function createConsoleLogTransport(): LogTransport;
export function setClientRequestId(requestId?: string | null): void;
export function getClientRequestId(): string | undefined;
