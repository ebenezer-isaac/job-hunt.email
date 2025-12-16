'use client';

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComments, faFileLines, faLink } from "@fortawesome/free-solid-svg-icons";

export function WelcomePanel() {
  return (
    <div className="mb-8 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-700 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-950 px-6 py-10 text-center">
      <p className="text-sm uppercase tracking-wide text-zinc-500 dark:text-zinc-400">job-hunt.email</p>
      <h2 className="mt-3 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">AI Job Application Assisstant</h2>
      <p className="mt-2 text-base text-zinc-500 dark:text-zinc-400">Paste a URL, drop in a job description and get a customized cv with the click of a button</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {["Paste a URL", "Paste Job Description", "Refine Content"].map((title, index) => (
          <div key={title} className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-6 text-left shadow-sm">
            <div className="text-2xl text-zinc-700 dark:text-zinc-300">
              <FontAwesomeIcon icon={[faLink, faFileLines, faComments][index]} />
            </div>
            <p className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {index === 0
                ? "Drop a job posting link to auto-extract details."
                : index === 1
                  ? "Paste the entire description and let AI analyse it."
                  : "Chat back with refinements to perfect each document."}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
