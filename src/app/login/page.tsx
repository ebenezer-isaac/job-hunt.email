import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign in | CV Customiser",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        {/* Hero Section */}
        <div className="mb-12 text-center">
          <p className="text-sm uppercase tracking-wide text-zinc-500 dark:text-zinc-400">job-hunt.email</p>
          <h1 className="mt-3 text-4xl font-bold text-zinc-900 dark:text-zinc-100 md:text-5xl">AI Job Application Assistant</h1>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-300">
            Generate tailored CVs, cover letters, and outreach emails with the click of a button
          </p>
          
          {/* Feature List - Visible on all devices */}
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-6 py-8 text-left shadow-sm">
              <div className="text-3xl">📄</div>
              <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Tailored CVs</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Automatically rewrites your CV to match specific job descriptions using LaTeX for professional formatting.
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-6 py-8 text-left shadow-sm">
              <div className="text-3xl">✉️</div>
              <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Smart Cover Letters</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Generates cover letters that reference your relevant experience and match the job requirements.
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-6 py-8 text-left shadow-sm sm:col-span-2 lg:col-span-1">
              <div className="text-3xl">📬</div>
              <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Cold Outreach</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Drafts personalized emails to recruiters and hiring managers based on your profile.
              </p>
            </div>
          </div>
        </div>

        {/* Sign In Card - Pushed down below hero */}
        <div className="flex justify-center">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 shadow-xl">
            <Suspense fallback={<p className="text-center text-sm text-zinc-500 dark:text-zinc-400">Preparing login form…</p>}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
