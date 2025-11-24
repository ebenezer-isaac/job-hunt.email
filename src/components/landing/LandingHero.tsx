'use client';

import Link from "next/link";

export function LandingHero() {
  return (
    <div className="max-w-2xl pt-10">
      <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-2">
        Stop manually editing CVs.
        <span className="block text-zinc-600 dark:text-zinc-400 mt-0.5">Let AI do it.</span>
      </h1>

      <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
        Land your dream job by automatically tailoring your CV, writing compelling cover letters, and drafting
        personalized cold emails for every application.
      </p>

      <div className="space-y-3 mb-4">
        <Feature
          icon="🕵️"
          title="Deep Research Agents"
          description="Agents scour news, blogs, and social profiles to find talking points and decision-makers."
        />
        <Feature
          icon="🧠"
          title="Gemini 3 & LlamaIndex"
          description="Powered by Gemini 3 Pro and LlamaIndex for grounded, hallucination-free content."
        />
        <Feature
          icon="📄"
          title="Sandboxed LaTeX"
          description="Generates professional, ATS-friendly PDFs using real LaTeX in isolated containers."
        />
        <Feature
          icon="⚡"
          title="Background Processing"
          description="Fire-and-forget. Run multiple applications simultaneously in the background."
        />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Link
          href="/guide"
          className="inline-flex items-center gap-2 rounded-full bg-zinc-900 dark:bg-zinc-100 px-6 py-3 text-sm font-semibold text-white dark:text-zinc-900 shadow-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
        >
          Learn How to Use
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
        <a
          href="https://github.com/ebenezer-isaac/job-hunt.email"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-6 py-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100 shadow hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
          </svg>
          View on GitHub
        </a>
      </div>

      <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
        <div className="mb-1.5 inline-flex items-center gap-2 rounded-full bg-zinc-100 dark:bg-zinc-800 px-3.5 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
          </span>
          Open Source & Self-Hostable
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Why contribute? The job market is an arms race. Companies use AI to filter you out; we use AI to get you in. Help us level the playing field by contributing to this open-source project.
        </p>
      </div>
    </div>
  );
}

interface FeatureProps {
  icon: string;
  title: string;
  description: string;
}

function Feature({ icon, title, description }: FeatureProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-3xl flex-shrink-0">{icon}</div>
      <div>
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">{title}</h3>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm">{description}</p>
      </div>
    </div>
  );
}