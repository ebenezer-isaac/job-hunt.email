'use client';

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionSidebar } from "@/components/chat/SessionSidebar";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { SessionStoreProvider, type InitialSessionState, useSessionStore } from "@/store/session-store";
import { useSessionSubscription } from "@/hooks/useSessionSubscription";
import { LOGIN_PAGE_PATH, LOGOUT_PATH } from "@/lib/auth-shared";
import { createDebugLogger } from "@/lib/debug-logger";
import { QuotaProvider, useQuota, type ClientQuotaSnapshot } from "@/hooks/useQuota";
import { clientEnv } from "@/lib/env-client";

import { TopNav } from "@/components/landing/TopNav";
import { UserMenu } from "@/components/auth/UserMenu";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const storeInitialState = { ...initialState, quota };

  return (
    <SessionStoreProvider initialState={storeInitialState}>
      <SessionSubscriptionBoundary userId={userId}>
        <QuotaProvider userId={userId} initialQuota={quota}>
          <div className="flex min-h-screen bg-zinc-100 dark:bg-zinc-950 pt-16 md:pt-0">
            <div className="md:hidden">
              <TopNav 
                userProfile={userProfile} 
                onOpenSettings={() => setPanel('settings')}
                onToggleSidebar={() => setMobileMenuOpen((prev) => !prev)}
                showSidebarToggle={true}
              />
            </div>
            <SessionSidebar
              collapsed={sidebarCollapsed}
              onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
              onSessionSelected={() => setPanel('chat')}
              mobileOpen={mobileMenuOpen}
              onMobileClose={() => setMobileMenuOpen(false)}
            />
            <div className="flex flex-1 flex-col w-full max-w-full overflow-hidden">
              <header className="hidden md:flex flex-wrap items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-8 py-5">
                <div>
                  <p className="text-xs uppercase tracking-widest text-zinc-400">job-hunt.email</p>
                  <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">AI Job Application Assisstant</h1>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
              <main id="main-content" className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-900 p-4 md:p-6 w-full">
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
  const currentSessionId = useSessionStore((state) => state.currentSessionId);

  useEffect(() => {
    if (currentSessionId) {
      const url = new URL(window.location.href);
      url.searchParams.set("sessionId", currentSessionId);
      window.history.replaceState({}, "", url.toString());
    } else {
      const url = new URL(window.location.href);
      url.searchParams.delete("sessionId");
      window.history.replaceState({}, "", url.toString());
    }
  }, [currentSessionId]);

  return <>{children}</>;
}
