import { describe, expect, it, beforeEach, vi } from "vitest";

import { REQUEST_ID_HEADER } from "@/lib/debug-logger";
import { INTERNAL_TOKEN_HEADER } from "@/lib/security/internal-token";
import { POST, __logRouteTestUtils } from "./route";
import { appendLogEntry } from "@/lib/logging/server-log-writer";

const VALID_TOKEN = vi.hoisted(() => "test-internal-token");

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({
  env: {
    ACCESS_CONTROL_INTERNAL_TOKEN: VALID_TOKEN,
    FIREBASE_PROJECT_ID: "demo-project",
    NODE_ENV: "test",
  },
}));

vi.mock("@/lib/logging/server-log-writer", () => ({
  appendLogEntry: vi.fn(() => Promise.resolve()),
}));

const appendLogEntryMock = vi.mocked(appendLogEntry);

describe("/api/log route", () => {
  beforeEach(() => {
    __logRouteTestUtils.resetRateLimiter();
    vi.clearAllMocks();
  });

  it("rejects requests with missing or invalid token", async () => {
    const response = await POST(
      buildRequest(
        { entry: buildEntry() },
        {
          headers: {
            [INTERNAL_TOKEN_HEADER]: "bad-token",
          },
        },
      ),
    );

    expect(response.status).toBe(403);
    expect(appendLogEntryMock).not.toHaveBeenCalled();
  });

  it("fails fast when payload exceeds the byte limit", async () => {
    const oversized = "a".repeat(20_000);
    const response = await POST(
      buildRequest({ entry: { ...buildEntry(), data: { blob: oversized } } }),
    );

    expect(response.status).toBe(413);
    expect(appendLogEntryMock).not.toHaveBeenCalled();
  });

  it("throttles clients that exceed the per-minute budget", async () => {
    const totalAllowed = __logRouteTestUtils.RATE_LIMIT_MAX_REQUESTS;
    let response: Response | null = null;
    for (let index = 0; index < totalAllowed; index += 1) {
      response = await POST(
        buildRequest(
          { entry: buildEntry({ message: `ok-${index}` }) },
          { headers: { "x-log-client": "suite", [REQUEST_ID_HEADER]: `req-${index}` } },
        ),
      );
      expect(response.status).toBe(200);
    }

    const throttled = await POST(
      buildRequest(
        { entry: buildEntry({ message: "after-limit" }) },
        { headers: { "x-log-client": "suite" } },
      ),
    );

    expect(throttled.status).toBe(429);
    expect(appendLogEntryMock).toHaveBeenCalledTimes(totalAllowed);
  });

  it("accepts a small, valid entry and invokes the writer", async () => {
    const response = await POST(
      buildRequest(
        { entry: { ...buildEntry(), data: { ok: true } } },
        { headers: { "x-log-client": "integration-client" } },
      ),
    );

    expect(response.status).toBe(200);
    expect(appendLogEntryMock).toHaveBeenCalledTimes(1);
    expect(appendLogEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "ingest",
        level: "info",
        message: "hello world",
        data: { ok: true },
      }),
    );
  });
});

function buildEntry(overrides?: Partial<{ scope: string; message: string }>) {
  return {
    level: "info" as const,
    scope: overrides?.scope ?? "ingest",
    message: overrides?.message ?? "hello world",
  };
}

function buildRequest(
  body: unknown,
  options?: { headers?: Record<string, string> },
): Request {
  const headers = new Headers({
    "content-type": "application/json",
    [INTERNAL_TOKEN_HEADER]: VALID_TOKEN,
    ...options?.headers,
  });
  return new Request("http://localhost/api/log", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
