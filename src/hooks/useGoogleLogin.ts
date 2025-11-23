import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase-client";
import { LOGIN_REDIRECT_PARAM_KEY, LOGIN_STATUS_PARAM_KEY } from "@/lib/auth-shared";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export function useGoogleLogin() {
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
    if (!loginStatus) return;
    const loginStatusMessages: Record<string, string> = {
      "invalid-token": "Your authentication token expired. Please sign in again to refresh your session.",
    };
    const message = loginStatusMessages[loginStatus];
    if (message) {
      setStatusStep(null);
      setIsSubmitting(false);
      setError(message);
    }
  }, [loginStatus]);

  useEffect(() => {
    if (!isAllowlistDenied) return;
    setStatusStep(null);
    setIsSubmitting(false);
    setError(null);
  }, [isAllowlistDenied]);

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

      setStatusStep('redirecting');
      router.push(redirectPath);
      router.refresh();
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "Unexpected error";
      setError(message);
      setStatusStep(null);
      setIsSubmitting(false);
    }
  };

  return {
    isSubmitting,
    error,
    statusStep,
    isAllowlistDenied,
    handleGoogleSignIn
  };
}
