'use client';

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionSidebar } from "@/components/chat/SessionSidebar";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { SessionStoreProvider, type InitialSessionState } from "@/store/session-store";
import { useSessionSubscription } from "@/hooks/useSessionSubscription";
import { LOGIN_PAGE_PATH, LOGOUT_PATH } from "@/lib/auth-shared";
import { createDebugLogger } from "@/lib/debug-logger";
import { QuotaProvider, useQuota, type ClientQuotaSnapshot } from "@/hooks/useQuota";
import { clientEnv } from "@/lib/env-client";

const userMenuLogger = createDebugLogger("chat-user-menu");
const contactEmail = clientEnv.contactEmail;

export type ChatAppProps = {
  initialState: InitialSessionState;
  userId: string;
  userProfile: {
    displayName?: string;
    email?: string;
    photoURL?: string | null;
  };
  quota: ClientQuotaSnapshot;
};

export function ChatApp({ initialState, userId, userProfile, quota }: ChatAppProps) {
  const [panel, setPanel] = useState<'chat' | 'settings'>('chat');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const storeInitialState = { ...initialState, quota };

  return (
    <SessionStoreProvider initialState={storeInitialState}>
      <SessionSubscriptionBoundary userId={userId}>
        <QuotaProvider userId={userId} initialQuota={quota}>
          <div className="flex min-h-screen bg-zinc-100">
            <SessionSidebar
              collapsed={sidebarCollapsed}
              onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
              onSessionSelected={() => setPanel('chat')}
            />
            <div className="flex flex-1 flex-col">
              <header className="flex flex-wrap items-center justify-between border-b border-zinc-200 bg-white px-8 py-5">
                <div>
                  <p className="text-xs uppercase tracking-widest text-zinc-400">job-hunt.email</p>
                  <h1 className="text-2xl font-semibold text-zinc-900">AI Job Application Assisstant</h1>
                  <p className="text-sm text-zinc-500">
                    Tailored CVs, cover letters, and outreach sequences in a single console.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <UserMenu
                    profile={userProfile}
                    onOpenSettings={() => setPanel('settings')}
                  />
                </div>
              </header>
              <main id="main-content" className="flex-1 overflow-y-auto bg-zinc-50 p-6">
                {panel === 'chat' ? <ChatInterface /> : <SettingsPanel onClose={() => setPanel('chat')} />}
              </main>
            </div>
          </div>
        </QuotaProvider>
      </SessionSubscriptionBoundary>
    </SessionStoreProvider>
  );
}

function SessionSubscriptionBoundary({ userId, children }: { userId: string; children: React.ReactNode }) {
  useSessionSubscription(userId);
  return <>{children}</>;
}

type UserMenuProps = {
  profile: {
    displayName?: string;
    email?: string;
    photoURL?: string | null;
  };
  onOpenSettings: () => void;
};

function UserMenu({ profile, onOpenSettings }: UserMenuProps) {
  const quota = useQuota();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    setAvatarFailed(false);
  }, [profile.photoURL]);

  const avatarUrl = profile.photoURL ?? undefined;
  const initials = (profile.displayName ?? profile.email ?? 'User')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    setOpen(false);
    try {
      await fetch(LOGOUT_PATH, { method: 'POST', credentials: 'include' });
    } catch (error) {
      userMenuLogger.error('Logout failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      router.push(LOGIN_PAGE_PATH);
    }
  };

  const toggleMenu = () => setOpen((prev) => !prev);
  const openSettings = () => {
    onOpenSettings();
    setOpen(false);
  };
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={toggleMenu}
        className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-left transition hover:border-zinc-300"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="h-9 w-9 overflow-hidden rounded-full bg-zinc-100">
          {avatarUrl && !avatarFailed ? (
            <Image
              src={avatarUrl}
              alt={profile.displayName ?? 'User avatar'}
              width={36}
              height={36}
              sizes="36px"
              className="h-full w-full object-cover"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-zinc-600">
              {initials}
            </span>
          )}
        </div>
        <div className="hidden text-left sm:block">
          <p className="text-xs font-semibold text-zinc-900">{profile.displayName ?? 'Workspace'}</p>
          <p className="text-[11px] text-zinc-500">{profile.email ?? ''}</p>
        </div>
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-3 w-56 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl">
          <div className="px-3 py-2 text-xs text-zinc-500">
            Signed in as
            <p className="text-sm font-semibold text-zinc-900">{profile.displayName ?? profile.email ?? 'Workspace'}</p>
          </div>
          {quota ? (
            <div className="mb-2 rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              <p className="font-semibold text-zinc-900">Usage</p>
              <p>Remaining: {quota.remaining} / {quota.totalAllocated}</p>
              <p>On hold: {quota.onHold}</p>
              <p className="mt-1 text-[11px] text-zinc-500">Need more? Email {contactEmail}</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={openSettings}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            Settings
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}
