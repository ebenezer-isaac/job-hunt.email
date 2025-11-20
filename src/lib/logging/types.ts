export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  timestamp: string;
  scope: string;
  level: LogLevel;
  message: string;
  data?: unknown;
  requestId?: string;
};

export type LogTransport = {
  send: (entry: LogEntry) => void | Promise<void>;
};
