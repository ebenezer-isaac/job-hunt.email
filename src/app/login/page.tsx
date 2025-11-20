import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign in | CV Customiser",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12">
      <div className="w-full max-w-xs rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
        <Suspense fallback={<p className="text-center text-sm text-zinc-500">Preparing login form…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
