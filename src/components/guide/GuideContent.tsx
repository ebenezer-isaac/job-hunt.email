'use client';

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";

export function GuideContent() {
  const [activeTab, setActiveTab] = useState<'web' | 'local'>('web');

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/login" className="text-2xl font-bold text-zinc-900">
                Job Hunt Assistant
              </Link>
              <span className="text-sm text-zinc-500">/ How to Use</span>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800 transition"
            >
              Sign In
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-zinc-900 mb-4">How to Use Job Hunt Assistant</h1>
          <p className="text-xl text-zinc-600">
            Follow this guide to start generating tailored CVs, cover letters, and cold emails for your job applications.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8 border-b border-zinc-200">
          <nav className="flex gap-8">
            <button
              onClick={() => setActiveTab('web')}
              className={`pb-4 text-sm font-semibold transition border-b-2 ${
                activeTab === 'web'
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700'
              }`}
            >
              Using the Web App
            </button>
            <button
              onClick={() => setActiveTab('local')}
              className={`pb-4 text-sm font-semibold transition border-b-2 ${
                activeTab === 'local'
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700'
              }`}
            >
              Running Locally
            </button>
          </nav>
        </div>

        {/* Content based on active tab */}
        {activeTab === 'web' ? <WebAppGuide /> : <LocalSetupGuide />}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white py-8 mt-16">
        <div className="max-w-5xl mx-auto px-6 text-center text-sm text-zinc-600">
          <p>
            Need help? Check the{' '}
            <a
              href="https://github.com/ebenezer-isaac/job-hunt.email"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-900 underline"
            >
              GitHub repository
            </a>{' '}
            or open an issue.
          </p>
        </div>
      </footer>
    </div>
  );
}

function WebAppGuide() {
  return (
    <div className="space-y-8">
      {/* Getting Started */}
      <Section title="1. Getting Started" icon="🚀">
        <div className="space-y-4">
          <p className="text-zinc-700">
            The web application is currently in closed beta. You&apos;ll need access approval to use it.
          </p>
          <Steps>
            <Step number="1" title="Request Access">
              Visit the login page and click &quot;Request access&quot; to email the administrator. 
              You&apos;ll receive a confirmation once your email is added to the allowlist.
            </Step>
            <Step number="2" title="Sign In">
              Once approved, click &quot;Sign in with Google&quot; and select your authorized Google account.
            </Step>
            <Step number="3" title="Welcome to Your Workspace">
              After signing in, you&apos;ll see your workspace with a chat interface and settings panel.
            </Step>
          </Steps>
        </div>
      </Section>

      {/* Initial Setup */}
      <Section title="2. Initial Setup" icon="⚙️">
        <div className="space-y-4">
          <p className="text-zinc-700">
            Before generating your first application materials, you need to upload your baseline documents.
          </p>
          <Steps>
            <Step number="1" title="Navigate to Settings">
              Click the gear icon or &quot;Settings&quot; in the sidebar to access your profile settings.
            </Step>
            <Step number="2" title="Upload Your Master CV">
              Upload your &quot;Original CV&quot; in LaTeX format (.tex file). This is the template the AI will customize.
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
                💡 <strong>Tip:</strong> If you don&apos;t have a LaTeX CV, you can convert your Word/PDF CV using online tools 
                or start with a LaTeX template from Overleaf.
              </div>
            </Step>
            <Step number="3" title="Add Your Extensive CV">
              Paste a comprehensive text version of your complete work history, skills, projects, and achievements. 
              Include everything—the AI will pick relevant parts for each application.
            </Step>
            <Step number="4" title="Customize Strategies (Optional)">
              You can define custom strategies for CV formatting, cover letter tone, and cold email style. 
              Or use the defaults provided.
            </Step>
          </Steps>
        </div>
      </Section>

      {/* Creating Applications */}
      <Section title="3. Creating Job Applications" icon="📄">
        <div className="space-y-4">
          <p className="text-zinc-700">
            Now you&apos;re ready to generate customized application materials for specific jobs.
          </p>
          <Steps>
            <Step number="1" title="Start a New Session">
              Click &quot;New Session&quot; or the &quot;+&quot; button to create a new application session.
            </Step>
            <Step number="2" title="Paste the Job Description">
              Copy the job posting (from LinkedIn, Indeed, company website, etc.) and paste it into the input field. 
              You can paste a URL or the raw text.
            </Step>
            <Step number="3" title="Click Generate">
              Hit the &quot;Generate&quot; button. The AI will:
              <ul className="list-disc list-inside mt-2 ml-4 space-y-1 text-zinc-600">
                <li>Research the company and role</li>
                <li>Extract key requirements and keywords</li>
                <li>Rewrite your CV to match the job description</li>
                <li>Generate a tailored cover letter</li>
                <li>Draft a cold email for outreach (if applicable)</li>
              </ul>
            </Step>
            <Step number="4" title="Review and Download">
              Once generation is complete:
              <ul className="list-disc list-inside mt-2 ml-4 space-y-1 text-zinc-600">
                <li>Review the generated CV, cover letter, and email</li>
                <li>Download the PDF versions</li>
                <li>Copy text to clipboard for quick access</li>
                <li>Make manual edits if needed</li>
              </ul>
            </Step>
          </Steps>
        </div>
      </Section>

      {/* Tips and Best Practices */}
      <Section title="4. Tips for Best Results" icon="💡">
        <div className="space-y-3">
          <Tip>
            <strong>Keep your Extensive CV updated:</strong> The more comprehensive your input, the better the AI can match you to roles.
          </Tip>
          <Tip>
            <strong>Use full job descriptions:</strong> Include company info, requirements, and responsibilities for better customization.
          </Tip>
          <Tip>
            <strong>Review before sending:</strong> While the AI is powerful, always review outputs for accuracy and tone.
          </Tip>
          <Tip>
            <strong>Watch your quota:</strong> Each session uses AI tokens. Check your remaining quota in the settings.
          </Tip>
          <Tip>
            <strong>Save important sessions:</strong> Sessions are automatically saved. You can return to them anytime from the sidebar.
          </Tip>
        </div>
      </Section>

      {/* Understanding the Output */}
      <Section title="5. Understanding the Output" icon="📊">
        <div className="space-y-4">
          <p className="text-zinc-700 mb-3">Each generation session produces several outputs:</p>
          <OutputCard
            title="Customized CV (PDF)"
            description="A professionally formatted CV tailored to the job, highlighting relevant experience and keywords for ATS systems."
          />
          <OutputCard
            title="Cover Letter"
            description="A personalized cover letter referencing 2-3 key achievements that match the role requirements."
          />
          <OutputCard
            title="Cold Email Draft"
            description="A concise, professional outreach email to hiring managers or recruiters (when contact info is available)."
          />
          <OutputCard
            title="Company Research Brief"
            description="Key insights about the company, role, and talking points for interviews."
          />
        </div>
      </Section>
    </div>
  );
}

function LocalSetupGuide() {
  return (
    <div className="space-y-8">
      {/* Prerequisites */}
      <Section title="Prerequisites" icon="📋">
        <p className="text-zinc-700 mb-4">
          Before you start, ensure you have the following installed on your computer:
        </p>
        <div className="space-y-3">
          <PrerequisiteCard
            title="Node.js (v18 or higher)"
            link="https://nodejs.org/"
            description="JavaScript runtime for running the application"
          />
          <PrerequisiteCard
            title="Git"
            link="https://git-scm.com/downloads"
            description="Version control system for cloning the repository"
          />
          <PrerequisiteCard
            title="LaTeX Distribution"
            description="Required for PDF generation"
          >
            <ul className="list-disc list-inside ml-4 space-y-1 text-sm text-zinc-600 mt-2">
              <li><strong>Windows:</strong> <a href="https://miktex.org/download" className="underline">MiKTeX</a> or TeX Live</li>
              <li><strong>Mac:</strong> <a href="https://www.tug.org/mactex/" className="underline">MacTeX</a> or <code className="px-1 py-0.5 bg-zinc-100 rounded">brew install --cask mactex</code></li>
              <li><strong>Linux:</strong> <code className="px-1 py-0.5 bg-zinc-100 rounded">sudo apt-get install texlive-full</code></li>
            </ul>
          </PrerequisiteCard>
          <PrerequisiteCard
            title="Poppler"
            description="Required for reading PDFs"
          >
            <ul className="list-disc list-inside ml-4 space-y-1 text-sm text-zinc-600 mt-2">
              <li><strong>Windows:</strong> <a href="https://github.com/oschwartz10612/poppler-windows/releases/" className="underline">Download Binary</a> (Add bin folder to PATH)</li>
              <li><strong>Mac:</strong> <code className="px-1 py-0.5 bg-zinc-100 rounded">brew install poppler</code></li>
              <li><strong>Linux:</strong> <code className="px-1 py-0.5 bg-zinc-100 rounded">sudo apt-get install poppler-utils</code></li>
            </ul>
          </PrerequisiteCard>
        </div>
      </Section>

      {/* Installation */}
      <Section title="Step-by-Step Installation" icon="🛠️">
        <Steps>
          <Step number="1" title="Clone the Repository">
            <p className="mb-2">Open your terminal and run:</p>
            <CodeBlock>{`git clone https://github.com/ebenezer-isaac/job-hunt.email.git
cd job-hunt.email`}</CodeBlock>
          </Step>
          
          <Step number="2" title="Install Dependencies">
            <CodeBlock>npm install</CodeBlock>
          </Step>
          
          <Step number="3" title="Configure Environment Variables">
            <p className="mb-2">Copy the example environment file:</p>
            <CodeBlock>cp .env.example .env.local</CodeBlock>
            <p className="mt-3 text-zinc-700">
              Then open <code className="px-1 py-0.5 bg-zinc-100 rounded text-sm">.env.local</code> in a text editor and fill in the required values.
            </p>
          </Step>
          
          <Step number="4" title="Setup Firebase">
            <p className="mb-3">This application uses Firebase for authentication and data storage:</p>
            <ol className="list-decimal list-inside space-y-2 ml-4 text-zinc-700">
              <li>Go to <a href="https://console.firebase.google.com/" className="underline">Firebase Console</a> and create a new project</li>
              <li>Enable <strong>Authentication</strong> (Google sign-in)</li>
              <li>Enable <strong>Firestore Database</strong> (Production mode)</li>
              <li>Enable <strong>Storage</strong> (Production mode)</li>
              <li>Copy the configuration values to your <code className="px-1 py-0.5 bg-zinc-100 rounded text-sm">.env.local</code></li>
            </ol>
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-900">
              ⚠️ <strong>Important:</strong> See the detailed README for exact Firebase setup steps and environment variable names.
            </div>
          </Step>
          
          <Step number="5" title="Setup Google Gemini AI">
            <ol className="list-decimal list-inside space-y-2 ml-4 text-zinc-700">
              <li>Visit <a href="https://aistudio.google.com/" className="underline">Google AI Studio</a></li>
              <li>Click &quot;Get API key&quot;</li>
              <li>Create a new API key</li>
              <li>Add it to <code className="px-1 py-0.5 bg-zinc-100 rounded text-sm">.env.local</code> as <code className="px-1 py-0.5 bg-zinc-100 rounded text-sm">GEMINI_API_KEY</code></li>
            </ol>
          </Step>
          
          <Step number="6" title="Generate Security Keys">
            <p className="mb-2">Run this command twice to generate two random keys:</p>
            <CodeBlock>{`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`}</CodeBlock>
            <p className="mt-3 text-zinc-700">
              Use the first output for <code className="px-1 py-0.5 bg-zinc-100 rounded text-sm">ACCESS_CONTROL_INTERNAL_TOKEN</code>{' '}
              and the second for <code className="px-1 py-0.5 bg-zinc-100 rounded text-sm">FIREBASE_AUTH_COOKIE_SIGNATURE_KEYS</code>
            </p>
          </Step>
          
          <Step number="7" title="Set Admin Email (Recommended)">
            <p className="mb-2">Add your email to skip the allowlist check:</p>
            <CodeBlock>ADMIN_EMAIL=your.email@gmail.com</CodeBlock>
            <p className="mt-3 text-zinc-700">This gives you instant access with a higher usage quota.</p>
          </Step>
          
          <Step number="8" title="Run the Application">
            <CodeBlock>npm run dev</CodeBlock>
            <p className="mt-3 text-zinc-700">
              Open <a href="http://localhost:3000" className="underline">http://localhost:3000</a> in your browser.
            </p>
          </Step>
        </Steps>
      </Section>

      {/* Troubleshooting */}
      <Section title="Common Issues" icon="🔧">
        <div className="space-y-4">
          <TroubleshootItem
            problem="LaTeX errors during PDF generation"
            solution="Ensure LaTeX is properly installed and accessible in your PATH. Try running 'pdflatex --version' in terminal to verify."
          />
          <TroubleshootItem
            problem="Firebase authentication errors"
            solution="Double-check your Firebase configuration in .env.local. Ensure you've enabled Google sign-in in the Firebase console."
          />
          <TroubleshootItem
            problem="Port 3000 already in use"
            solution="Kill the process using port 3000 or specify a different port: 'PORT=3001 npm run dev'"
          />
          <TroubleshootItem
            problem="Gemini API quota exceeded"
            solution="Check your Google AI Studio quota limits. You may need to wait or upgrade your API plan."
          />
        </div>
      </Section>

      {/* Additional Resources */}
      <Section title="Additional Resources" icon="📚">
        <div className="space-y-3">
          <ResourceLink
            title="Full README"
            url="https://github.com/ebenezer-isaac/job-hunt.email#readme"
            description="Complete technical documentation with detailed setup instructions"
          />
          <ResourceLink
            title="GitHub Issues"
            url="https://github.com/ebenezer-isaac/job-hunt.email/issues"
            description="Report bugs or request features"
          />
          <ResourceLink
            title="Contributing Guide"
            url="https://github.com/ebenezer-isaac/job-hunt.email#contributing"
            description="Learn how to contribute to the project"
          />
        </div>
      </Section>
    </div>
  );
}

// Helper Components

interface SectionProps {
  title: string;
  icon: string;
  children: ReactNode;
}

function Section({ title, icon, children }: SectionProps) {
  return (
    <section className="bg-white rounded-2xl border border-zinc-200 p-8 shadow-sm">
      <h2 className="text-2xl font-bold text-zinc-900 mb-6 flex items-center gap-3">
        <span className="text-3xl">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

interface StepProps {
  number: string;
  title: string;
  children: ReactNode;
}

function Step({ number, title, children }: StepProps) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-zinc-900 text-white text-sm font-bold">
        {number}
      </div>
      <div className="flex-1 pt-0.5">
        <h4 className="font-semibold text-zinc-900 mb-2">{title}</h4>
        <div className="text-zinc-700 text-sm">{children}</div>
      </div>
    </div>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-zinc-50 rounded-lg border border-zinc-200">
      <span className="text-lg">💡</span>
      <p className="text-sm text-zinc-700">{children}</p>
    </div>
  );
}

interface OutputCardProps {
  title: string;
  description: string;
}

function OutputCard({ title, description }: OutputCardProps) {
  return (
    <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200">
      <h4 className="font-semibold text-zinc-900 mb-1">{title}</h4>
      <p className="text-sm text-zinc-600">{description}</p>
    </div>
  );
}

interface PrerequisiteCardProps {
  title: string;
  link?: string;
  description: string;
  children?: ReactNode;
}

function PrerequisiteCard({ title, link, description, children }: PrerequisiteCardProps) {
  return (
    <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200">
      <h4 className="font-semibold text-zinc-900 mb-1">
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-700">
            {title}
          </a>
        ) : (
          title
        )}
      </h4>
      <p className="text-sm text-zinc-600">{description}</p>
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto text-sm">
      <code>{children}</code>
    </pre>
  );
}

interface TroubleshootItemProps {
  problem: string;
  solution: string;
}

function TroubleshootItem({ problem, solution }: TroubleshootItemProps) {
  return (
    <div className="p-4 bg-red-50 rounded-lg border border-red-200">
      <h4 className="font-semibold text-red-900 mb-2">Problem: {problem}</h4>
      <p className="text-sm text-red-800"><strong>Solution:</strong> {solution}</p>
    </div>
  );
}

interface ResourceLinkProps {
  title: string;
  url: string;
  description: string;
}

function ResourceLink({ title, url, description }: ResourceLinkProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-4 bg-zinc-50 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100 transition group"
    >
      <h4 className="font-semibold text-zinc-900 mb-1 group-hover:text-zinc-700">
        {title}
        <svg className="inline-block ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </h4>
      <p className="text-sm text-zinc-600">{description}</p>
    </a>
  );
}
