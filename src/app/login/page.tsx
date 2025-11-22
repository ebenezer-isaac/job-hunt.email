import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { LandingHero } from "@/components/landing/LandingHero";

export const metadata: Metadata = {
  title: "Job Hunt Assistant | AI-Powered CV & Cover Letter Generator",
  description: "Stop manually tweaking your CV. Let AI do it. Generate tailored CVs, cover letters, and cold emails for your job applications in seconds.",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-50">
      {/* Left side - Hero/Info Section */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 items-center justify-center p-12">
        <LandingHero />
      </div>
      
      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile: Show simplified hero */}
          <div className="lg:hidden mb-8">
            <h1 className="text-3xl font-bold text-zinc-900 mb-2">Job Hunt Assistant</h1>
            <p className="text-zinc-600">AI-powered CV and cover letter generator</p>
          </div>
          
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <Suspense fallback={<p className="text-center text-sm text-zinc-500">Preparing login form…</p>}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
