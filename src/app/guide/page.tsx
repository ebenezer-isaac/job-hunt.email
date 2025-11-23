'use client';

import { useState } from 'react';
import { InteractiveGrid } from '@/components/landing/InteractiveGrid';
import { TopNav } from '@/components/landing/TopNav';

export default function GuidePage() {
  const [activeTab, setActiveTab] = useState<'web' | 'local'>('web');

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-white dark:bg-zinc-950 transition-colors duration-300 pt-16">
      <TopNav />
      <InteractiveGrid />
      
      <div className="relative z-10 mx-auto max-w-4xl px-6 py-12 md:py-20">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-5xl">
            How to Use Job Hunt Assistant
          </h1>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            Follow this guide to start generating tailored CVs, cover letters, and cold emails for your job applications.
          </p>
        </div>

        <div className="mb-8 flex justify-center border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setActiveTab('web')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'web'
                ? 'border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            Using the Web App
          </button>
          <button
            onClick={() => setActiveTab('local')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'local'
                ? 'border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            Running Locally
          </button>
        </div>

        <div className="space-y-12">
          {activeTab === 'web' ? <WebAppGuide /> : <LocalGuide />}
        </div>
        
        <div className="mt-20 border-t border-zinc-200 dark:border-zinc-800 pt-8 text-center">
           <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Need help? Check the <a href="https://github.com/ebenezer-isaac/job-hunt.email" target="_blank" rel="noreferrer" className="font-medium text-zinc-900 dark:text-zinc-100 underline">GitHub repository</a> or open an issue.
          </p>
        </div>
      </div>
    </div>
  );
}

function WebAppGuide() {
  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Section title="Why LaTeX CV?" icon="✨">
        <p className="mb-4 text-zinc-600 dark:text-zinc-400">
          We use LaTeX for CV generation because it offers superior advantages for job applications:
        </p>
        <ul className="ml-4 list-disc space-y-2 text-zinc-600 dark:text-zinc-400">
          <li><span className="font-semibold text-zinc-900 dark:text-zinc-100">Beats the Bots (ATS):</span> Hiring robots often struggle to read standard PDFs. LaTeX creates clean, error-free files that ensure your skills are actually seen and ranked by the system.</li>
          <li><span className="font-semibold text-zinc-900 dark:text-zinc-100">AI-Powered Precision:</span> Think of it as &quot;smart text.&quot; Our AI can surgically rewrite your CV for every job application without ever breaking your layout or formatting.</li>
          <li><span className="font-semibold text-zinc-900 dark:text-zinc-100">Polished & Professional:</span> It automatically handles the tiny details—like spacing, fonts, and alignment—giving your CV a high-end look that Word docs just can&apos;t match.</li>
          <li><span className="font-semibold text-zinc-900 dark:text-zinc-100">No-Headache Formatting:</span> Stop fighting with margins. With LaTeX, you change the text, and the document organizes itself. It&apos;s the stress-free way to keep your CV updated.</li>
        </ul>
      </Section>

      <Section title="1. Getting Started" icon="🚀">
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          The web application is currently in closed beta. You&apos;ll need access approval to use it.
        </p>
        <Step number={1} title="Request Access">
          <p>
            Access to the hosted version is limited. To request access, please email <span className="font-medium text-zinc-900 dark:text-zinc-100">ebenezr.isaac@gmail.com</span>. Or run it locally for free.
          </p>
        </Step>
        <Step number={2} title="Sign In">
          <p>
            Once approved, click &quot;Sign in with Google&quot; and select your authorized Google account.
          </p>
        </Step>
        <Step number={3} title="Welcome to Your Workspace">
          <p>
            After signing in, you&apos;ll see your workspace with a chat interface and settings panel.
          </p>
        </Step>
      </Section>

      <Section title="2. Initial Setup" icon="⚙️">
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          Before generating your first application materials, you need to upload your baseline documents.
        </p>
        <Step number={1} title="Navigate to Settings">
          <p>
            Click your profile icon in the top right corner and select &quot;Settings&quot; from the dropdown menu.
          </p>
        </Step>
        <Step number={2} title="Upload Your Master CV">
          <p className="mb-2">
            Upload your &quot;Original CV&quot; in LaTeX format (.tex file). This is crucial because the AI uses the structure of LaTeX to precisely manipulate your CV content while maintaining professional formatting.
          </p>
          <ul className="ml-4 list-disc space-y-1 text-zinc-500 dark:text-zinc-400">
            <li><span className="font-medium text-zinc-700 dark:text-zinc-300">Need help generating a LaTeX CV?</span> We recommend <a href="https://resumake.io/" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Resumake.io</a> to easily build a professional LaTeX resume.</li>
            <li><span className="font-medium text-zinc-700 dark:text-zinc-300">Sample Template:</span> Check out this <a href="https://www.overleaf.com/read/prfgjwdxvxsb#d03be1" className="text-blue-600 dark:text-blue-400 hover:underline">Sample LaTeX CV on Overleaf</a> to see a compatible structure.</li>
            <li><span className="font-medium text-zinc-700 dark:text-zinc-300">Editing:</span> You can edit and preview your LaTeX code at <a href="https://www.overleaf.com" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Overleaf</a>.</li>
          </ul>
        </Step>
        <Step number={3} title="Add Your Extensive CV">
          <p>
            Paste a comprehensive text version of your complete work history, skills, projects, and achievements. Include everything—the AI will pick relevant parts for each application.
          </p>
        </Step>
        <Step number={4} title="Customize Strategies (Optional)">
          <p>
            You can define custom strategies for CV formatting, cover letter tone, and cold email style. Or use the defaults provided.
          </p>
        </Step>
      </Section>

      <Section title="3. Creating Job Applications" icon="📄">
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          Now you&apos;re ready to generate customized application materials for specific jobs.
        </p>
        <Step number={1} title="Start a New Session">
          <p>
            Click &quot;New Session&quot; or the &quot;+&quot; button to create a new application session.
          </p>
        </Step>
        <Step number={2} title="Paste the Job Description">
          <p>
            Copy the job posting (from LinkedIn, Indeed, company website, etc.) and paste it into the input field. You can paste a URL or the raw text.
          </p>
        </Step>
        <Step number={3} title="Click Generate">
          <p className="mb-2">
            Hit the &quot;Generate&quot; button. The AI will:
          </p>
          <ul className="ml-4 list-disc space-y-1 text-zinc-500 dark:text-zinc-400">
            <li>Research the company and role</li>
            <li>Extract key requirements and keywords</li>
            <li>Rewrite your CV to match the job description</li>
            <li>Generate a tailored cover letter</li>
            <li>Draft a cold email for outreach (if applicable)</li>
          </ul>
        </Step>
        <Step number={4} title="Review and Download">
          <p className="mb-2">
            Once generation is complete:
          </p>
          <ul className="ml-4 list-disc space-y-1 text-zinc-500 dark:text-zinc-400">
            <li>Review the generated CV, cover letter, and email</li>
            <li>Download the PDF versions</li>
            <li>Copy text to clipboard for quick access</li>
            <li>Make manual edits if needed</li>
          </ul>
        </Step>
      </Section>

      <Section title="4. Tips for Best Results" icon="💡">
        <div className="space-y-4">
          <Tip title="Keep your Extensive CV updated">
            The more comprehensive your input, the better the AI can match you to roles.
          </Tip>
          <Tip title="Use full job descriptions">
            Include company info, requirements, and responsibilities for better customization.
          </Tip>
          <Tip title="Review before sending">
            While the AI is powerful, always review outputs for accuracy and tone.
          </Tip>
          <Tip title="Watch your quota">
            Each session uses AI tokens. Check your remaining quota in the settings.
          </Tip>
          <Tip title="Save important sessions">
            Sessions are automatically saved. You can return to them anytime from the sidebar.
          </Tip>
        </div>
      </Section>

      <Section title="5. Understanding the Output" icon="📊">
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          Each generation session produces several outputs:
        </p>
        <div className="space-y-4">
          <OutputCard title="Customized CV (PDF)">
            A professionally formatted CV tailored to the job, highlighting relevant experience and keywords for ATS systems.
          </OutputCard>
          <OutputCard title="Cover Letter">
            A personalized cover letter referencing 2-3 key achievements that match the role requirements.
          </OutputCard>
          <OutputCard title="Cold Email Draft">
            A concise, professional outreach email to hiring managers or recruiters (when contact info is available).
          </OutputCard>
          <OutputCard title="Company Research Brief">
            Key insights about the company, role, and talking points for interviews.
          </OutputCard>
        </div>
      </Section>
    </div>
  );
}

function LocalGuide() {
  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Section title="Step-by-Step Installation with Docker" icon="🐳">
        <Step number={1} title="Clone the Repository">
          <p className="mb-2">Open your terminal and run:</p>
          <CodeBlock>
            git clone https://github.com/ebenezer-isaac/job-hunt.email.git{'\n'}
            cd job-hunt.email
          </CodeBlock>
        </Step>
        <Step number={2} title="Configure Environment Variables">
          <p className="mb-2">Copy the example environment file:</p>
          <CodeBlock>cp .env.example .env.local</CodeBlock>
          <p className="mt-2">Then open <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-sm">.env.local</code> in a text editor and fill in the required values.</p>
        </Step>
        <Step number={3} title="Setup Firebase">
          <p className="mb-2">This application uses Firebase for authentication and data storage:</p>
          <ol className="ml-4 list-decimal space-y-1 text-zinc-600 dark:text-zinc-400">
            <li>Go to <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Firebase Console</a> and create a new project</li>
            <li>Enable <strong>Authentication</strong> (Google sign-in)</li>
            <li>Enable <strong>Firestore Database</strong> (Production mode)</li>
            <li>Enable <strong>Storage</strong> (Production mode)</li>
            <li>Copy the configuration values to your <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-sm">.env.local</code></li>
          </ol>
          <div className="mt-4 rounded-md border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900/50 dark:bg-yellow-900/20">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ <strong>Important:</strong> See the detailed README for exact Firebase setup steps and environment variable names.
            </p>
          </div>
        </Step>
        <Step number={4} title="Setup Google Gemini AI">
          <ol className="ml-4 list-decimal space-y-1 text-zinc-600 dark:text-zinc-400">
            <li>Visit <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Google AI Studio</a></li>
            <li>Click &quot;Get API key&quot;</li>
            <li>Create a new API key</li>
            <li>Add it to <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-sm">.env.local</code> as <code className="font-mono">GEMINI_API_KEY</code></li>
          </ol>
        </Step>
        <Step number={5} title="Generate Security Keys">
          <p className="mb-2">Run this command twice to generate two random keys:</p>
          <CodeBlock>
            node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64&apos;))&quot;
          </CodeBlock>
          <p className="mt-2">Use the first output for <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-sm">ACCESS_CONTROL_INTERNAL_TOKEN</code> and the second for <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-sm">FIREBASE_AUTH_COOKIE_SIGNATURE_KEYS</code></p>
        </Step>
        <Step number={6} title="Set Admin Email (Recommended)">
          <p className="mb-2">Add your email to skip the allowlist check:</p>
          <CodeBlock>ADMIN_EMAIL=your.email@gmail.com</CodeBlock>
          <p className="mt-2">This gives you instant access with a higher usage quota.</p>
        </Step>
        <Step number={7} title="Build and Run with Docker">
          <p className="mb-2">Build the Docker image:</p>
          <CodeBlock>docker build -t job-hunt-app .</CodeBlock>
          <p className="mt-2 mb-2">Run the container:</p>
          <CodeBlock>docker run -p 8080:8080 --env-file .env.local job-hunt-app</CodeBlock>
          <p className="mt-2">Open <a href="http://localhost:8080" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">http://localhost:8080</a> in your browser.</p>
        </Step>
      </Section>

      <Section title="Common Issues" icon="🔧">
        <div className="space-y-4">
          <Issue 
            problem="LaTeX errors during PDF generation" 
            solution="Ensure LaTeX is properly installed and accessible in your PATH. Try running 'pdflatex --version' in terminal to verify." 
          />
          <Issue 
            problem="Firebase authentication errors" 
            solution="Double-check your Firebase configuration in .env.local. Ensure you've enabled Google sign-in in the Firebase console." 
          />
          <Issue 
            problem="Port 3000 already in use" 
            solution="Kill the process using port 3000 or specify a different port: 'PORT=3001 npm run dev'" 
          />
          <Issue 
            problem="Gemini API quota exceeded" 
            solution="Check your Google AI Studio quota limits. You may need to wait or upgrade your API plan." 
          />
        </div>
      </Section>

      <Section title="Additional Resources" icon="📚">
        <div className="space-y-4">
          <ResourceCard title="Full README" href="#" description="Complete technical documentation with detailed setup instructions" />
          <ResourceCard title="GitHub Issues" href="#" description="Report bugs or request features" />
          <ResourceCard title="Contributing Guide" href="#" description="Learn how to contribute to the project" />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
      <h2 className="mb-6 flex items-center gap-3 text-xl font-bold text-zinc-900 dark:text-zinc-100">
        <span className="text-2xl">{icon}</span> {title}
      </h2>
      {children}
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 flex gap-4 last:mb-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
        {number}
      </div>
      <div className="flex-1">
        <h3 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
        <div className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {children}
        </div>
      </div>
    </div>
  );
}

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
      <span className="text-lg">💡</span>
      <div>
        <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">{title}</h4>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{children}</p>
      </div>
    </div>
  );
}

function OutputCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <h4 className="mb-1 font-semibold text-zinc-900 dark:text-zinc-100">{title}</h4>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{children}</p>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg bg-zinc-900 p-4 text-sm text-zinc-100 dark:bg-black max-w-full">
      <pre className="font-mono whitespace-pre-wrap break-all">{children}</pre>
    </div>
  );
}

function Issue({ problem, solution }: { problem: string; solution: string }) {
  return (
    <div className="rounded-lg border border-red-100 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-900/10">
      <p className="font-semibold text-red-900 dark:text-red-200">Problem: {problem}</p>
      <p className="mt-1 text-sm text-red-700 dark:text-red-300"><span className="font-semibold">Solution:</span> {solution}</p>
    </div>
  );
}

function ResourceCard({ title, href, description }: { title: string; href: string; description: string }) {
  return (
    <a href={href} className="block rounded-lg border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">{title}</h4>
        <span className="text-zinc-400">↗</span>
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
    </a>
  );
}
