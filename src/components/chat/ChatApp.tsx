'use client';

import { useEffect, useState } from "react";
import { SessionSidebar } from "@/components/chat/SessionSidebar";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { SessionStoreProvider, type InitialSessionState, useSessionStore } from "@/store/session-store";
import { useSessionSubscription } from "@/hooks/useSessionSubscription";
import { QuotaProvider, type ClientQuotaSnapshot } from "@/hooks/useQuota";
import { TopNav } from "@/components/landing/TopNav";
import { UserMenu } from "@/components/auth/UserMenu";

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
  const storeInitialState = { ...initialState, quota };

  return (
    <SessionStoreProvider initialState={storeInitialState}>
      <SessionSubscriptionBoundary userId={userId}>
        <QuotaProvider userId={userId} initialQuota={quota}>
          <ChatShell userProfile={userProfile} />
        </QuotaProvider>
      </SessionSubscriptionBoundary>
    </SessionStoreProvider>
  );
}

type PanelView = "chat" | "settings";

function ChatShell({ userProfile }: { userProfile: ChatAppProps["userProfile"] }) {
  const [panel, setPanel] = useState<PanelView>("chat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-zinc-100 dark:bg-zinc-950 pt-16 md:pt-0">
      <MobilePrimaryNav
        userProfile={userProfile}
        onOpenSettings={() => setPanel("settings")}
        onToggleSidebar={() => setMobileMenuOpen((prev) => !prev)}
      />
      <SessionSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        onSessionSelected={() => setPanel("chat")}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <div className="flex flex-1 flex-col w-full max-w-full overflow-hidden">
        <DesktopHeader userProfile={userProfile} onOpenSettings={() => setPanel("settings")} />
        <MainContent panel={panel} onCloseSettings={() => setPanel("chat")} />
      </div>
    </div>
  );
}

function MobilePrimaryNav({
  userProfile,
  onOpenSettings,
  onToggleSidebar,
}: {
  userProfile: ChatAppProps["userProfile"];
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
}) {
  return (
    <div className="md:hidden">
      <TopNav
        userProfile={userProfile}
        onOpenSettings={onOpenSettings}
        onToggleSidebar={onToggleSidebar}
        showSidebarToggle
      />
    </div>
  );
}

function DesktopHeader({
  userProfile,
  onOpenSettings,
}: {
  userProfile: ChatAppProps["userProfile"];
  onOpenSettings: () => void;
}) {
  return (
    <header className="hidden md:flex flex-wrap items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-8 py-5">
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-400">job-hunt.email</p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">AI Job Application Assistant</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Tailored CVs, cover letters, and outreach sequences in a single console.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <UserMenu profile={userProfile} onOpenSettings={onOpenSettings} />
      </div>
    </header>
  );
}

function MainContent({ panel, onCloseSettings }: { panel: PanelView; onCloseSettings: () => void }) {
  return (
    <main id="main-content" className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-900 p-4 md:p-6 w-full">
      {panel === "chat" ? <ChatInterface /> : <SettingsPanel onClose={onCloseSettings} />}
    </main>
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
