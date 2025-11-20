'use client';

import { useMemo } from "react";
import { useSessionStore } from "@/store/session-store";

type SessionSidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSessionSelected?: () => void;
};

const STATUS_META: Record<string, { label: string; icon: string; bg: string; text: string; animate?: string }> = {
  processing: { label: "Processing", icon: "⟳", bg: "bg-amber-100", text: "text-amber-700", animate: "animate-spin" },
  completed: { label: "Completed", icon: "✓", bg: "bg-emerald-100", text: "text-emerald-700" },
  failed: { label: "Failed", icon: "!", bg: "bg-red-100", text: "text-red-700", animate: "animate-bounce" },
  approved: { label: "Approved", icon: "★", bg: "bg-sky-100", text: "text-sky-700" },
};

export function SessionSidebar({ collapsed, onToggleCollapsed, onSessionSelected }: SessionSidebarProps) {
  const sessions = useSessionStore((state) => state.sessions);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const { selectSession, setGeneratedDocuments } = useSessionStore((state) => state.actions);

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => getSessionSortValue(b) - getSessionSortValue(a));
  }, [sessions]);

  const handleNewChat = () => {
    selectSession(null);
    setGeneratedDocuments(null, null);
    onSessionSelected?.();
  };

  return (
    <aside
      className={`relative hidden border-r border-zinc-200 bg-white/80 backdrop-blur transition-all duration-300 ease-in-out md:flex md:flex-col ${
        collapsed ? "md:w-16" : "md:w-80"
      }`}
      aria-label="Session history sidebar"
    >
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="group absolute -right-4 top-4 hidden h-12 w-12 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-md transition hover:border-zinc-400 hover:text-zinc-900 md:flex"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <span className="text-2xl">{collapsed ? "⤢" : "⤡"}</span>
      </button>
      {collapsed ? (
        <div className="flex h-full flex-col items-center gap-4 py-5">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-white shadow-md transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-700"
            aria-label="Start new chat"
          >
            <span className="text-2xl font-bold leading-none">+</span>
            <span className="sr-only">Start new chat</span>
          </button>
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
            {sortedSessions.map((session) => {
              const isActive = session.id === currentSessionId;
              const timestampIso = getSessionTimestampIso(session);
              const formattedTimestamp = formatSessionTimestamp(timestampIso);
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => {
                    selectSession(session.id);
                    onSessionSelected?.();
                  }}
                  className={`flex h-12 w-12 items-center justify-center rounded-full border text-xs font-semibold transition ${
                    isActive
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300"
                  }`}
                  title={`${session.title} • ${formattedTimestamp}`}
                >
                  {session.title.slice(0, 2).toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">Conversations</p>
              <p className="text-base font-semibold text-zinc-950">Session History</p>
            </div>
            <button
              type="button"
              onClick={handleNewChat}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-800"
              aria-label="Start new chat"
            >
              <span className="text-2xl font-bold leading-none">+</span>
              <span className="sr-only">Start new chat</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-6">
            {sortedSessions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500">
                No conversations yet. Start by pasting a job description.
              </p>
            ) : (
              <ul className="space-y-2">
                {sortedSessions.map((session) => {
                  const isActive = session.id === currentSessionId;
                  const timestampIso = getSessionTimestampIso(session);
                  const formattedTimestamp = formatSessionTimestamp(timestampIso);
                  return (
                    <li key={session.id}>
                      <button
                        type="button"
                        onClick={() => {
                          selectSession(session.id);
                          onSessionSelected?.();
                        }}
                        className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                          isActive
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300"
                        }`}
                      >
                        <div className="flex items-center justify-between text-sm font-semibold">
                          <span className="truncate">{session.title}</span>
                          <SessionStatusBadge status={session.status} />
                        </div>
                        <p className={`mt-1 text-xs ${isActive ? "text-zinc-200" : "text-zinc-500"}`}>{formattedTimestamp}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

function SessionStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status ?? "Unknown", icon: "•", bg: "bg-zinc-100", text: "text-zinc-500" };
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${meta.bg} ${meta.text}`}
      aria-label={meta.label}
    >
      <span className={`${meta.animate ?? ""} text-base`}>{meta.icon}</span>
    </span>
  );
}

function getSessionTimestampIso(session: { metadata?: Record<string, unknown>; createdAt: string }) {
  const candidate = session.metadata?.lastGeneratedAt;
  if (typeof candidate === "string" && candidate.trim().length) {
    return candidate;
  }
  return session.createdAt;
}

function getSessionSortValue(session: { metadata?: Record<string, unknown>; createdAt: string }) {
  const iso = getSessionTimestampIso(session);
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? Date.parse(session.createdAt) : parsed;
}

function formatSessionTimestamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
