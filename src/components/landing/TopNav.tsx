'use client';

import Link from "next/link";
import { useGoogleLogin } from "@/hooks/useGoogleLogin";
import { UserMenu } from "@/components/auth/UserMenu";

type TopNavProps = {
  userProfile?: {
    displayName?: string;
    email?: string;
    photoURL?: string | null;
  };
  onOpenSettings?: () => void;
  onToggleSidebar?: () => void;
  showSidebarToggle?: boolean;
};

export function TopNav({ userProfile, onOpenSettings, onToggleSidebar, showSidebarToggle }: TopNavProps) {
  const { handleGoogleSignIn, isSubmitting, isAllowlistDenied } = useGoogleLogin();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 md:px-6 md:py-4 backdrop-blur-md bg-white/70 dark:bg-zinc-950/70 border-b border-zinc-200/50 dark:border-zinc-800/50">
      <div className="flex items-center gap-3">
        {showSidebarToggle && onToggleSidebar ? (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition hover:bg-zinc-50 dark:hover:bg-zinc-700 md:hidden"
            aria-label="Toggle sidebar"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        ) : null}
        <Link href="/" className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 hover:opacity-80 transition-opacity">
          Job Hunt Assistant
        </Link>
      </div>

      <div className="flex items-center gap-4">
        {!userProfile && (
          <Link 
            href="/guide" 
            className="hidden sm:block text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            How to Use
          </Link>
        )}
        
        {userProfile && onOpenSettings ? (
          <UserMenu profile={userProfile} onOpenSettings={onOpenSettings} />
        ) : (
          <button
            onClick={handleGoogleSignIn}
            disabled={isSubmitting || isAllowlistDenied}
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-white dark:text-zinc-900 shadow-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-600 dark:border-zinc-300 dark:border-t-zinc-900" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <svg className="h-3 w-3" viewBox="0 0 533.5 544.3" aria-hidden="true">
                  <path fill="#4285f4" d="M533.5 278.4c0-18.5-1.5-37-4.7-54.9H272.1v103.9h147.4c-6.3 34-25 62.8-53.3 82v68h86.1c50.3-46.3 81.2-114.8 81.2-199z" />
                  <path fill="#34a853" d="M272.1 544.3c72.2 0 132.8-23.9 177-64.9l-86.1-68c-24 16.1-54.7 25.5-90.9 25.5-69.9 0-129.1-47.2-150.2-110.6h-88.6v69.4c44.7 88.6 136.2 148.6 238.8 148.6z" />
                  <path fill="#fbbc05" d="M121.9 326.3c-10.6-31.7-10.6-65.8 0-97.5v-69.4H33.3c-44.4 88.6-44.4 193.4 0 282z" />
                  <path fill="#ea4335" d="M272.1 107.7c38.9-.6 76.2 14 104.6 40.6l78.1-78.1C407.5 24.6 347 0 272.1 0 169.5 0 78 60 33.3 148.6l88.6 69.4C143 154.6 202.2 107.7 272.1 107.7z" />
                </svg>
                <span>Sign In</span>
              </>
            )}
          </button>
        )}
      </div>
    </nav>
  );
}

