'use client';

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRotate,
  faCheck,
  faExclamation,
  faStar,
  faExpand,
  faCompress,
  faPlus,
  faXmark,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { useMemo, useState, useRef, type TouchEvent } from "react";
import { useSessionStore } from "@/store/session-store";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { deleteSessionAction } from "@/app/actions/delete-session";
import { toast } from "sonner";

type SessionSidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSessionSelected?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

const STATUS_META: Record<string, { label: string; icon: IconDefinition; bg: string; text: string; animate?: string }> = {
  processing: { label: "Processing", icon: faRotate, bg: "bg-amber-100", text: "text-amber-700", animate: "animate-spin" },
  completed: { label: "Completed", icon: faCheck, bg: "bg-emerald-100", text: "text-emerald-700" },
  failed: { label: "Failed", icon: faExclamation, bg: "bg-red-100", text: "text-red-700", animate: "animate-bounce" },
  approved: { label: "Approved", icon: faStar, bg: "bg-sky-100", text: "text-sky-700" },
};

export function SessionSidebar({ collapsed, onToggleCollapsed, onSessionSelected, mobileOpen, onMobileClose }: SessionSidebarProps) {
  const sessions = useSessionStore((state) => state.sessions);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const { selectSession, setGeneratedDocuments, removeSession } = useSessionStore((state) => state.actions);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [swipeSessionId, setSwipeSessionId] = useState<string | null>(null);
  const [hoverDeleteSessionId, setHoverDeleteSessionId] = useState<string | null>(null);
  const touchStartRef = useRef<Record<string, number>>({});

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => getSessionSortValue(b) - getSessionSortValue(a));
  }, [sessions]);

  const handleNewChat = () => {
    selectSession(null);
    setGeneratedDocuments(null, null);
    onSessionSelected?.();
    onMobileClose?.();
  };

  const handleSessionClick = (sessionId: string) => {
    selectSession(sessionId);
    onSessionSelected?.();
    onMobileClose?.();
  };

  const handleDeleteSession = async (sessionId: string, title: string) => {
    if (deletingSessionId) {
      return;
    }
    const confirmed = typeof window === "undefined" ? true : window.confirm(`Delete session "${title}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }
    setDeletingSessionId(sessionId);
    try {
      await deleteSessionAction(sessionId);
      removeSession(sessionId);
      if (swipeSessionId === sessionId) {
        setSwipeSessionId(null);
      }
      if (hoverDeleteSessionId === sessionId) {
        setHoverDeleteSessionId(null);
      }
      toast.success("Session deleted");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to delete session: ${message}`);
    } finally {
      setDeletingSessionId((prev) => (prev === sessionId ? null : prev));
    }
  };

  const handleTouchStart = (sessionId: string, event: TouchEvent) => {
    touchStartRef.current[sessionId] = event.touches[0]?.clientX ?? 0;
  };

  const handleTouchMove = (sessionId: string, event: TouchEvent) => {
    const startX = touchStartRef.current[sessionId];
    if (typeof startX !== "number") {
      return;
    }
    const delta = event.touches[0]?.clientX ?? startX;
    const diff = delta - startX;
    if (diff < -30) {
      setSwipeSessionId(sessionId);
    }
    if (diff > 30 && swipeSessionId === sessionId) {
      setSwipeSessionId(null);
    }
  };

  const handleTouchEnd = (sessionId: string) => {
    delete touchStartRef.current[sessionId];
  };

  return (
    <>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden" onClick={onMobileClose} />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
          mobileOpen ? "translate-x-0 w-80" : "-translate-x-full md:translate-x-0"
        } ${collapsed ? "md:w-16" : "md:w-80"}`}
        aria-label="Session history sidebar"
      >
        {/* Mobile Close Button */}
        <button
          type="button"
          onClick={onMobileClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 md:hidden"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>

        {/* Desktop Collapse Button */}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="group absolute -right-4 top-4 hidden h-12 w-12 items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 shadow-md transition hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100 md:flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span className="text-lg"><FontAwesomeIcon icon={collapsed ? faExpand : faCompress} /></span>
        </button>

        {collapsed && !mobileOpen ? (
          <div className="flex h-full flex-col items-center gap-4 py-5">
            <button
              type="button"
              onClick={handleNewChat}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-md transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-700 dark:focus-visible:outline-zinc-300"
              aria-label="Start new chat"
            >
              <FontAwesomeIcon icon={faPlus} className="text-xl" />
              <span className="sr-only">Start new chat</span>
            </button>
            <div className="mt-4 flex-1 space-y-3 overflow-y-auto scrollbar-hide">
              {sortedSessions.map((session) => {
                const isActive = session.id === currentSessionId;
                const timestampIso = getSessionTimestampIso(session);
                const formattedTimestamp = formatSessionTimestamp(timestampIso);
                
                let statusClasses = "";
                if (session.status === 'processing') {
                   statusClasses = "ring-2 ring-amber-400 ring-offset-2 dark:ring-offset-zinc-900";
                } else if (session.status === 'completed' || session.status === 'approved') {
                   statusClasses = "shadow-[0_0_8px_rgba(16,185,129,0.6)] border-emerald-500 dark:border-emerald-400";
                } else if (session.status === 'failed') {
                   statusClasses = "shadow-[0_0_8px_rgba(239,68,68,0.6)] border-red-500 dark:border-red-400";
                }

                return (
                  <div
                    key={session.id}
                    className="relative group"
                    onTouchStart={(event) => handleTouchStart(session.id, event)}
                    onTouchMove={(event) => handleTouchMove(session.id, event)}
                    onTouchEnd={() => handleTouchEnd(session.id)}
                  >
                    <button
                      type="button"
                      onClick={() => handleSessionClick(session.id)}
                      className={`relative flex h-12 w-12 items-center justify-center rounded-full border text-xs font-semibold transition-transform duration-200 ${
                        isActive
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300"
                      } ${statusClasses} ${
                        swipeSessionId === session.id ? "-translate-x-6" : "translate-x-0"
                      } group-hover:-translate-x-6 group-focus-within:-translate-x-6`}
                      title={`${session.title} • ${formattedTimestamp}`}
                    >
                      {session.status === 'processing' && (
                        <span className="absolute inset-0 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                      )}
                      {session.title.slice(0, 2).toUpperCase()}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete session ${session.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteSession(session.id, session.title);
                      }}
                      disabled={deletingSessionId === session.id}
                      className={`absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 shadow transition-opacity duration-200 hover:bg-red-50 disabled:opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 ${
                        swipeSessionId === session.id ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      <FontAwesomeIcon icon={faTrash} className="text-xs" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-4 mt-8 md:mt-0">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Conversations</p>
                <p className="text-base font-semibold text-zinc-950 dark:text-zinc-100">Session History</p>
              </div>
              <button
                type="button"
                onClick={handleNewChat}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-lg transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-800 dark:focus-visible:outline-zinc-300"
                aria-label="Start new chat"
              >
                <FontAwesomeIcon icon={faPlus} className="text-xl" />
                <span className="sr-only">Start new chat</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-6">
              {sortedSessions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-200 dark:border-zinc-700 px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
                  No conversations yet. Start by pasting a job description.
                </p>
              ) : (
                <ul className="space-y-2">
                  {sortedSessions.map((session) => {
                    const isActive = session.id === currentSessionId;
                    const timestampIso = getSessionTimestampIso(session);
                    const formattedTimestamp = formatSessionTimestamp(timestampIso);
                    return (
                      <li
                        key={session.id}
                        className="relative overflow-hidden group"
                        onTouchStart={(event) => handleTouchStart(session.id, event)}
                        onTouchMove={(event) => handleTouchMove(session.id, event)}
                        onTouchEnd={() => handleTouchEnd(session.id)}
                      >
                        <button
                          type="button"
                          onClick={() => handleSessionClick(session.id)}
                          className={`relative w-full rounded-xl border px-4 py-3 pr-20 text-left transition-colors duration-200 transform ${
                            isActive
                              ? "border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                              : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-600"
                          } ${swipeSessionId === session.id ? "-translate-x-16" : "translate-x-0"}`}
                        >
                          <div className="text-sm font-semibold">
                            <span className="block truncate">{session.title}</span>
                          </div>
                          <p className={`mt-1 text-xs ${isActive ? "text-zinc-200 dark:text-zinc-700" : "text-zinc-500 dark:text-zinc-400"}`}>{formattedTimestamp}</p>
                        </button>
                        <div
                          className="absolute right-4 top-1/2 -translate-y-1/2"
                          onMouseEnter={() => setHoverDeleteSessionId(session.id)}
                          onMouseLeave={() => setHoverDeleteSessionId((prev) => (prev === session.id ? null : prev))}
                          onFocus={() => setHoverDeleteSessionId(session.id)}
                          onBlur={() => setHoverDeleteSessionId((prev) => (prev === session.id ? null : prev))}
                        >
                          {hoverDeleteSessionId === session.id ? (
                            <button
                              type="button"
                              aria-label={`Delete session ${session.title}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDeleteSession(session.id, session.title);
                              }}
                              disabled={deletingSessionId === session.id}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
                            >
                              {deletingSessionId === session.id ? (
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              ) : (
                                <FontAwesomeIcon icon={faTrash} />
                              )}
                            </button>
                          ) : (
                            <SessionStatusBadge status={session.status} />
                          )}
                        </div>
                        {swipeSessionId === session.id && hoverDeleteSessionId !== session.id ? (
                          <button
                            type="button"
                            aria-label={`Delete session ${session.title}`}
                            onClick={() => void handleDeleteSession(session.id, session.title)}
                            disabled={deletingSessionId === session.id}
                            className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
                          >
                            {deletingSessionId === session.id ? (
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            ) : (
                              <FontAwesomeIcon icon={faTrash} />
                            )}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function SessionStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status ?? "Unknown", icon: faRotate, bg: "bg-zinc-100", text: "text-zinc-500" };
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${meta.bg} ${meta.text}`}
      aria-label={meta.label}
    >
      <span className={`${meta.animate ?? ""} text-sm`}><FontAwesomeIcon icon={meta.icon} /></span>
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
