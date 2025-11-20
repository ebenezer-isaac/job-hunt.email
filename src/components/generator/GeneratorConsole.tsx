'use client';

import { useMemo, useState } from 'react';
import { DEMO_GENERATION_PAYLOAD } from '@/lib/demo-request';

const decoder = new TextDecoder();

export function GeneratorConsole() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logView, setLogView] = useState<'compact' | 'verbose'>('compact');

  const groupedLogs = useMemo(() => {
    const groups: Array<{ id: string; label: string; lines: string[] }> = [];
    let current: { id: string; label: string; lines: string[] } | null = null;

    logs.forEach((line, index) => {
      const isSectionLabel = /^[A-Z\s-]{3,}$/.test(line);

      if (isSectionLabel) {
        if (current) {
          groups.push(current);
        }
        current = {
          id: `${line}-${index}`,
          label: line,
          lines: [],
        };
        return;
      }

      if (!current) {
        current = {
          id: `log-${index}`,
          label: 'LOG ENTRY',
          lines: [],
        };
      }

      current.lines.push(line);
    });

    if (current) {
      groups.push(current);
    }

    return groups;
  }, [logs]);

  const runDemo = async () => {
    setLogs([]);
    setError(null);
    setIsRunning(true);

    try {
      const formData = new FormData();
      Object.entries(DEMO_GENERATION_PAYLOAD).forEach(([key, value]) => {
        formData.append(key, value);
      });

      const response = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      if (!response.body) {
        throw new Error('Streaming response missing body');
      }

      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

        if (lines.length) {
          setLogs((prev) => [...prev, ...lines]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-zinc-500">Module 4 Demo</p>
          <h2 className="text-2xl font-semibold text-zinc-950">AI Generation Console</h2>
        </div>
        <button
          type="button"
          onClick={runDemo}
          disabled={isRunning}
          className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isRunning ? 'Running…' : 'Run sample generation'}
        </button>
      </div>

      <p className="mt-4 text-sm text-zinc-600">
        Posts a demo payload to <code>/api/generate</code> and streams responses from{' '}
        <code>generateDocumentsAction</code>. Provide your own form data in the future UI to drive real sessions.
      </p>

      <div className="mt-6 flex h-64 flex-col rounded-md bg-zinc-50 p-4 text-sm text-zinc-800">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-medium text-zinc-500">Live stream</div>
          <label className="flex items-center gap-2 text-xs font-medium text-zinc-500">
            View
            <select
              value={logView}
              onChange={(event) => setLogView(event.target.value as 'compact' | 'verbose')}
              className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 focus:border-zinc-400 focus:outline-none"
            >
              <option value="compact">Compact</option>
              <option value="verbose">Verbose</option>
            </select>
          </label>
        </div>

        <div className="flex-1 overflow-y-auto rounded border border-dashed border-zinc-200 bg-white p-3">
          {groupedLogs.length === 0 && !error && (
            <p className="text-zinc-400">Press the button to start streaming output.</p>
          )}

          <div className="flex flex-col gap-3 whitespace-normal">
            {groupedLogs.map((entry, entryIndex) => {
              const previewLine = entry.lines[0] ?? 'Awaiting response…';
              const remainingLines = entry.lines.slice(1);

              return (
                <article
                  key={`${entry.id}-${entryIndex}`}
                  className="rounded-md border border-zinc-100 bg-zinc-50 p-3 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)]"
                >
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-zinc-500">
                    <span>{entry.label}</span>
                    <span>#{entryIndex + 1}</span>
                  </div>
                  {logView === 'compact' ? (
                    <p className="mt-2 text-sm text-zinc-900">{previewLine}</p>
                  ) : (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-900">
                      {[previewLine, ...remainingLines].map((line, lineIndex) => (
                        <li key={`${line}-${lineIndex}`}>{line}</li>
                      ))}
                    </ul>
                  )}
                  {logView === 'compact' && remainingLines.length > 0 && (
                    <p className="mt-2 text-xs text-zinc-500">
                      {remainingLines.length} more detailed line{remainingLines.length > 1 ? 's' : ''} hidden. Switch to verbose view to
                      expand.
                    </p>
                  )}
                </article>
              );
            })}
          </div>

          {error && <p className="mt-3 text-red-600">{error}</p>}
        </div>
      </div>
    </section>
  );
}
