'use client';

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LOGOUT_PATH, LOGIN_PAGE_PATH } from "@/lib/auth-shared";
import { createDebugLogger } from "@/lib/debug-logger";
import { useQuota } from "@/hooks/useQuota";
import { clientEnv } from "@/lib/env-client";

const userMenuLogger = createDebugLogger("chat-user-menu");
const contactEmail = clientEnv.contactEmail;

export type UserMenuProps = {
  profile: {
    displayName?: string;
    email?: string;
    photoURL?: string | null;
  };
  onOpenSettings: () => void;
};

export function UserMenu({ profile, onOpenSettings }: UserMenuProps) {
  const quota = useQuota();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
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
    setIsLoggingOut(true);
    try {
      await fetch(LOGOUT_PATH, { method: 'POST', credentials: 'include' });
    } catch (error) {
      userMenuLogger.error('Logout failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      setIsLoggingOut(false);
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
        className="flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-left transition hover:border-zinc-300 dark:hover:border-zinc-600"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="h-9 w-9 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
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
            <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-zinc-600 dark:text-zinc-300">
              {initials}
            </span>
          )}
        </div>
        <div className="hidden text-left sm:block">
          <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{profile.displayName ?? 'Workspace'}</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{profile.email ?? ''}</p>
        </div>
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-3 w-56 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 shadow-xl">
          <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
            Signed in as
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{profile.displayName ?? profile.email ?? 'Workspace'}</p>
          </div>
          {quota ? (
            <div className="mb-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">Usage</p>
              <p>Remaining: {quota.remaining} / {quota.totalAllocated}</p>
              <p>On hold: {quota.onHold}</p>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Need more? Email {contactEmail}</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={openSettings}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 transition hover:bg-zinc-50 dark:hover:bg-zinc-700"
          >
            Settings
          </button>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoggingOut ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-600/30 border-t-red-600 dark:border-red-400/30 dark:border-t-red-400" />
                <span>Logging out...</span>
              </>
            ) : (
              "Logout"
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
