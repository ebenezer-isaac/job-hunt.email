'use client';

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase-client";
import { LOGIN_REDIRECT_PARAM_KEY, LOGIN_STATUS_PARAM_KEY } from "@/lib/auth-shared";
import { clientEnv } from "@/lib/env-client";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
const allowlistContactEmail = clientEnv.contactEmail;
const repoUrl = clientEnv.repoUrl;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get(LOGIN_REDIRECT_PARAM_KEY);
  const loginStatus = searchParams.get(LOGIN_STATUS_PARAM_KEY);
  const redirectPath = redirectParam && redirectParam.startsWith("/") ? redirectParam : "/";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusStep, setStatusStep] = useState<'authenticating' | 'establishing' | 'redirecting' | null>(null);
  const isAllowlistDenied = loginStatus === "allowlist-denied";

  useEffect(() => {
    if (!loginStatus) {
      return;
    }
    const loginStatusMessages: Record<string, string> = {
      "invalid-token":
        "Your authentication token expired. Please sign in again to refresh your session.",
    };
    const message = loginStatusMessages[loginStatus];
    if (message) {
      setStatusStep(null);
      setIsSubmitting(false);
      setError(message);
    }
  }, [loginStatus]);

  useEffect(() => {
    if (!isAllowlistDenied) {
      return;
    }
    setStatusStep(null);
    setIsSubmitting(false);
    setError(null);
  }, [isAllowlistDenied, loginStatus]);

  const handleGoogleSignIn = async () => {
    if (isAllowlistDenied) {
      setError(null);
      setStatusStep(null);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setStatusStep('authenticating');

    try {
      const credential = await signInWithPopup(firebaseAuth, googleProvider);
      setStatusStep('establishing');
      const idToken = await credential.user.getIdToken();

      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        credentials: "include",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? "Unable to establish session");
      }
      const responseBody = await response.json().catch(() => null);

      setStatusStep('redirecting');
      router.push(redirectPath);
      router.refresh();
      return;
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "Unexpected error";
      setError(message);
      setStatusStep(null);
      setIsSubmitting(false);
    }
  };

  const effectiveStatus = isAllowlistDenied ? "denied" : statusStep;
  const statusCopy = effectiveStatus
    ? {
        authenticating: {
          title: "Verifying Google account",
          subtitle: "Pop-up confirmation finished, finalising sign-in...",
          variant: "progress" as const,
        },
        establishing: {
          title: "Creating secure session",
          subtitle: "Encrypting tokens and syncing workspace access.",
          variant: "progress" as const,
        },
        redirecting: {
          title: "Loading workspace",
          subtitle: "Fetching your documents and recent activity...",
          variant: "progress" as const,
        },
        denied: {
          title: "Access Denied",
          subtitle: `This Google account is not authorised to use this application. Please try again once your access request has been approved.`,
          variant: "blocked" as const,
        },
      }[effectiveStatus]
    : null;

  return (
    <div className="flex w-full flex-col items-center gap-4 text-center">
      {error ? (
        <p className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {statusCopy ? (
        <div
          className={`w-full rounded-2xl px-4 py-3 text-left shadow-sm ${
            statusCopy.variant === "blocked"
              ? "border border-red-200 bg-red-50/90"
              : "border border-zinc-200 bg-white/80"
          }`}
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <span className="inline-flex h-5 w-5 items-center justify-center">
              {statusCopy.variant === "blocked" ? <DeniedIcon /> : <LoadingSpinner />}
            </span>
            <div>
              <p className="text-sm font-semibold text-zinc-900">{statusCopy.title}</p>
              <p className="text-xs text-zinc-500">{statusCopy.subtitle}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-xs text-zinc-600">
        <p className="text-sm font-semibold text-zinc-900">Closed Beta Testing Notice</p>
        <p className="mt-1">
          Access is limited to approved applicants. Email <a href={`mailto:${allowlistContactEmail}`} className="font-medium text-zinc-900 underline">{allowlistContactEmail}</a> to request access.
        </p>
        <p className="mt-2">
          Disclaimer: This application is in closed beta testing and may contain bugs or incomplete features. Use at your own risk.
        </p>
        <p className="mt-2">
          All data logs and usage analytics are retained to improve performance and business logic. APIs incur compute and billing costs. Review the open-source code at <a href={repoUrl} target="_blank" rel="noreferrer" className="font-medium text-zinc-900 underline">GitHub</a> to self-host or raise issues.
        </p>
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isSubmitting || isAllowlistDenied}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-zinc-300 bg-white px-6 text-base font-medium text-zinc-900 shadow-sm transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isAllowlistDenied ? (
          <span className="text-sm font-semibold text-zinc-900">Request access to continue</span>
        ) : isSubmitting ? (
          <>
            <LoadingSpinner />
            <span className="text-sm font-semibold text-zinc-900">Please wait...</span>
          </>
        ) : (
          <>
            <svg
              className="h-5 w-5"
              viewBox="0 0 533.5 544.3"
              aria-hidden="true"
              focusable="false"
            >
              <path fill="#4285f4" d="M533.5 278.4c0-18.5-1.5-37-4.7-54.9H272.1v103.9h147.4c-6.3 34-25 62.8-53.3 82v68h86.1c50.3-46.3 81.2-114.8 81.2-199z" />
              <path fill="#34a853" d="M272.1 544.3c72.2 0 132.8-23.9 177-64.9l-86.1-68c-24 16.1-54.7 25.5-90.9 25.5-69.9 0-129.1-47.2-150.2-110.6h-88.6v69.4c44.7 88.6 136.2 148.6 238.8 148.6z" />
              <path fill="#fbbc05" d="M121.9 326.3c-10.6-31.7-10.6-65.8 0-97.5v-69.4H33.3c-44.4 88.6-44.4 193.4 0 282z" />
              <path fill="#ea4335" d="M272.1 107.7c38.9-.6 76.2 14 104.6 40.6l78.1-78.1C407.5 24.6 347 0 272.1 0 169.5 0 78 60 33.3 148.6l88.6 69.4C143 154.6 202.2 107.7 272.1 107.7z" />
            </svg>
            Sign in with Google
          </>
        )}
      </button>
      {isAllowlistDenied ? (
        <p className="text-xs text-zinc-500">Already added to the allowlist? <a href="./" className="font-medium text-zinc-900 underline">Click Here.</a></p>
      ) : null}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" aria-hidden />
  );
}

function DeniedIcon() {
  return (
    <svg
      className="h-5 w-5 text-red-600"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path d="M10 2a8 8 0 1 0 8 8 8.01 8.01 0 0 0-8-8m3.54 10.46a.75.75 0 0 1-1.06 1.06L10 11.06l-2.48 2.48a.75.75 0 1 1-1.06-1.06L8.94 10 6.46 7.52a.75.75 0 1 1 1.06-1.06L10 8.94l2.48-2.48a.75.75 0 0 1 1.06 1.06L11.06 10Z" />
    </svg>
  );
}
