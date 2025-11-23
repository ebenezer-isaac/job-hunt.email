import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { LandingHero } from "@/components/landing/LandingHero";
import { HeroShapes } from "@/components/landing/HeroShapes";
import { InteractiveGrid } from "@/components/landing/InteractiveGrid";
import { TopNav } from "@/components/landing/TopNav";

export const metadata: Metadata = {
  title: "Job Hunt Assistant | AI-Powered CV & Cover Letter Generator",
  description: "Stop manually tweaking your CV. Let AI do it. Generate tailored CVs, cover letters, and cold emails for your job applications in seconds.",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row bg-zinc-50 dark:bg-zinc-950 relative overflow-hidden pt-16 lg:pt-0">
      <TopNav />
      <InteractiveGrid />
      <HeroShapes />

      {/* Left side - Hero/Info Section */}
      <div className="w-full lg:w-1/2 xl:w-3/5 flex items-center justify-center p-6 lg:p-12 z-10 order-1 lg:order-1 mt-8 lg:mt-0">
        <LandingHero />
      </div>

      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-6 lg:p-12 z-10 order-2 lg:order-2">
        <div className="w-full max-w-md relative">
          {/* Mobile Floating Shape */}
          <div className="lg:hidden absolute -top-12 -right-6 w-24 h-24 opacity-[0.4] dark:opacity-[0.3] pointer-events-none select-none animate-float-slow rotate-12 -z-10">
            <svg 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="0.5" 
              className="w-full h-full text-black dark:text-white"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>

          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 shadow-xl backdrop-blur-sm bg-white/80 dark:bg-zinc-900/80">
            <Suspense fallback={<p className="text-center text-sm text-zinc-500 dark:text-zinc-400">Preparing login form…</p>}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
