#!/usr/bin/env tsx
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const outputPath = path.resolve(projectRoot, "tmp", "firebase-log-viewer.html");
const isDev = process.env.NODE_ENV ? process.env.NODE_ENV !== "production" : true;
loadEnvConfig(projectRoot, isDev);

const COLLECTION_NAME = process.env.FIREBASE_LOG_COLLECTION ?? "appLogs";

function parseLimit(): number {
  const limitFlag = process.argv.find((arg) => arg.startsWith("--limit="));
  if (!limitFlag) {
    return Number(process.env.FIREBASE_LOG_VIEWER_LIMIT ?? "500");
  }
  const value = Number(limitFlag.split("=")[1] ?? "");
  if (Number.isFinite(value) && value > 0) {
    return value;
  }
  throw new Error(`Invalid --limit value provided: ${limitFlag}`);
}

type PlainLogEntry = {
  id: string;
  createdAt: string | null;
  severity?: string;
  scope?: string;
  message?: string;
  requestId?: string;
  environment?: string;
  data?: unknown;
  context?: unknown;
};

async function fetchLogs(limit: number): Promise<PlainLogEntry[]> {
  const { getDb } = await import("@/lib/firebase-admin");
  const db = getDb();
  const snapshot = await db
    .collection(COLLECTION_NAME)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const createdAt = (data.createdAt && typeof (data.createdAt as { toDate?: () => Date }).toDate === "function")
      ? ((data.createdAt as { toDate: () => Date }).toDate().toISOString())
      : typeof data.timestamp === "string"
        ? (data.timestamp as string)
        : null;
    return {
      id: doc.id,
      createdAt,
      severity: data.severity as string | undefined,
      scope: data.scope as string | undefined,
      message: data.message as string | undefined,
      requestId: data.requestId as string | undefined,
      environment: data.environment as string | undefined,
      data: data.data,
      context: data.context,
    } satisfies PlainLogEntry;
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(logs: PlainLogEntry[]): string {
  const dataJson = JSON.stringify(logs);
  const generatedAt = new Date().toISOString();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Firestore Log Viewer</title>
  <link rel="stylesheet" href="https://cdn.datatables.net/1.13.8/css/jquery.dataTables.min.css" />
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; }
    h1 { margin-bottom: 0.25rem; }
    .meta { color: #555; margin-bottom: 1.5rem; }
    table { width: 100%; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
    .filters { margin-bottom: 1rem; display: flex; gap: 1rem; }
    .filters label { display: flex; flex-direction: column; font-size: 0.9rem; color: #333; }
    .filters select, .filters input { padding: 0.25rem 0.5rem; }
  </style>
</head>
<body>
  <h1>Firestore Log Viewer</h1>
  <div class="meta">Generated ${escapeHtml(generatedAt)} · Showing ${logs.length} entries from '${escapeHtml(COLLECTION_NAME)}'</div>
  <div class="filters">
    <label>
      Severity
      <select id="severityFilter">
        <option value="">All severities</option>
        <option value="DEBUG">DEBUG</option>
        <option value="INFO">INFO</option>
        <option value="WARNING">WARNING</option>
        <option value="ERROR">ERROR</option>
      </select>
    </label>
    <label>
      Scope contains
      <input id="scopeFilter" type="text" placeholder="scope substring" />
    </label>
  </div>
  <table id="logsTable" class="display">
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Severity</th>
        <th>Scope</th>
        <th>Message</th>
        <th>Request ID</th>
        <th>Environment</th>
        <th>Data</th>
        <th>Context</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>
  <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
  <script src="https://cdn.datatables.net/1.13.8/js/jquery.dataTables.min.js"></script>
  <script>
    const LOG_DATA = ${dataJson};
    function escapeHtmlContent(value) {
      return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
    function formatJson(value) {
      if (value === undefined || value === null) {
        return "";
      }
      const serialized = escapeHtmlContent(JSON.stringify(value, null, 2));
      return '<pre>' + serialized + '</pre>';
    }
    $(function () {
      const table = $('#logsTable').DataTable({
        data: LOG_DATA,
        columns: [
          { data: 'createdAt', defaultContent: '' },
          { data: 'severity', defaultContent: '' },
          { data: 'scope', defaultContent: '' },
          { data: 'message', defaultContent: '' },
          { data: 'requestId', defaultContent: '' },
          { data: 'environment', defaultContent: '' },
          { data: 'data', render: (value) => formatJson(value), orderable: false },
          { data: 'context', render: (value) => formatJson(value), orderable: false },
        ],
        pageLength: 25,
        order: [[0, 'desc']],
      });

      $('#severityFilter').on('change', function () {
        const value = this.value;
        table.column(1).search(value, false, false).draw();
      });

      $('#scopeFilter').on('input', function () {
        table.column(2).search(this.value, true, false).draw();
      });
    });
  </script>
</body>
</html>`;
}

async function main(): Promise<void> {
  const limit = parseLimit();
  const logs = await fetchLogs(limit);
  const html = buildHtml(logs);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, html, { encoding: "utf8" });
  console.log(`✅ Firestore log viewer written to ${outputPath}`);
}

main().catch((error) => {
  console.error("❌ Failed to render Firestore log viewer:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
