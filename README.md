# Job Hunt Assistant (AI-Powered)

**Stop manually tweaking your CV. Let AI do it.**

This is an open-source, AI-powered workbench that helps you land your dream job by automating the tedious parts of the application process. It uses Google's Gemini AI to tailor your CV, write compelling cover letters, and draft personalized cold emails based on job descriptions.

**Why use this?**
*   **Tailored CVs**: Automatically rewrites your CV to match specific job descriptions using LaTeX for professional formatting.
*   **Smart Cover Letters**: Generates cover letters that actually make sense and reference your relevant experience.
*   **Cold Outreach**: Drafts personalized emails to recruiters and hiring managers.
*   **Contact Finding**: (Optional) Integrates with Apollo.io to find verified email addresses for key contacts.
*   **Privacy Focused**: You host it yourself. Your data stays with you (and Google/Firebase/Apollo, but not a third-party SaaS).

---

## Features

*   **CV Customization**: Upload your "Master CV" and a job description, and get a perfectly tailored PDF.
*   **Cover Letter Generator**: Creates matching cover letters in seconds.
*   **Cold Email Drafts**: Generates outreach emails based on the company and role.
*   **Research Briefs**: AI analyzes the company and role to give you talking points for interviews.
*   **Quota System**: Built-in usage limits to manage API costs.

---

## Prerequisites

Before you start, make sure you have the following installed on your computer:

1.  **Docker**: [Download Here](https://www.docker.com/products/docker-desktop/)
2.  **Git**: [Download Here](https://git-scm.com/downloads)

---

## Step-by-Step Setup Guide

Follow these steps to get the project running on your local machine using Docker.

### 1. Clone the Repository
Open your terminal (Command Prompt, PowerShell, or Terminal) and run:

```bash
git clone https://github.com/ebenezer-isaac/job-hunt.email.git
cd job-hunt.email
```

### 2. Configure Environment Variables
This project needs secrets (API keys) to work.

1.  Copy the example environment file:
    ```bash
    cp .env.example .env.local
    # On Windows PowerShell: copy .env.example .env.local
    ```
2.  Open `.env.local` in a text editor (like VS Code or Notepad). You will need to fill in the blanks.
  *Deployments*: copy the same template to `.env.build` so Cloud Run/build scripts read identical values.

### 3. Setup Firebase (Database & Auth)
This app uses Firebase for logging in and saving your data.

1.  Go to the [Firebase Console](https://console.firebase.google.com/) and click **"Add project"**. Give it a name.
2.  **Enable Authentication**:
    *   Go to **Build > Authentication** in the sidebar.
    *   Click **"Get started"**.
    *   Select **Google** as a Sign-in provider, enable it, and save.
3.  **Enable Firestore Database**:
    *   Go to **Build > Firestore Database**.
    *   Click **"Create database"**.
    *   Select **Production mode** (we have rules to secure it).
    *   Choose a location near you.
4.  **Enable Storage**:
    *   Go to **Build > Storage**.
    *   Click **"Get started"**.
    *   Start in **Production mode**.
5.  **Get Admin Keys** (for the server):
    *   Click the **Gear icon** (Project Settings) > **Service accounts**.
    *   Click **"Generate new private key"**. This downloads a JSON file.
    *   Open the JSON file. Copy the values to your `.env.local`:
        *   `FIREBASE_PROJECT_ID` -> `project_id`
        *   `FIREBASE_CLIENT_EMAIL` -> `client_email`
        *   `FIREBASE_PRIVATE_KEY` -> `private_key` (Copy the whole string including `-----BEGIN PRIVATE KEY...`)
6.  **Get Client Keys** (for the browser):
    *   Go to **Project Settings > General**.
    *   Scroll down to **"Your apps"** and click the **Web (</>)** icon.
    *   Register the app (name it whatever you want).
    *   Copy the config values to your `.env.local`:
        *   `NEXT_PUBLIC_FIREBASE_API_KEY` -> `apiKey`
        *   `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` -> `authDomain`
        *   `NEXT_PUBLIC_FIREBASE_PROJECT_ID` -> `projectId`
        *   `FIREBASE_STORAGE_BUCKET` -> `storageBucket`

### 4. Setup Gemini AI
1.  Go to [Google AI Studio](https://aistudio.google.com/).
2.  Click **"Get API key"**.
3.  Click **"Create API key in new project"**.
4.  Copy the key and paste it into `.env.local` as `GEMINI_API_KEY`.

### 5. Setup Apollo (Optional)
*Required only if you want to find email addresses for cold outreach.*
1.  Go to [Apollo.io](https://www.apollo.io/) and sign up.
2.  Go to **Settings > Integrations > API**.
3.  Click **"Create New Key"**.
4.  Paste it into `.env.local` as `APOLLO_API_KEY`.
*Note: CV customization and cover letters work fine without this.*

### 6. Final Configuration
You need a few secure random strings for auth + Server Actions:

1. **Internal token** (48-byte base64) for `ACCESS_CONTROL_INTERNAL_TOKEN`:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
  ```
2. **Cookie signatures** (generate twice, comma-separate both outputs) for `FIREBASE_AUTH_COOKIE_SIGNATURE_KEYS`:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
3. **Deterministic Server Action key** (32-byte base64) for `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` so multi-instance deployments stop throwing `failed-to-find-server-action`:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```

### 7. Admin Access (Recommended)
To avoid manually editing the database to allow yourself in, set your email as the admin.
*   In `.env.local`, set `ADMIN_EMAIL=your.email@gmail.com`.
*   This gives you instant access and a higher usage quota (1000 tokens).

### 8. Build and Run with Docker
Build the Docker image:
```bash
docker build -t job-hunt-app .
```

Run the container:
```bash
docker run -p 8080:8080 --env-file .env.local job-hunt-app
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

### 9. Whitelist Others (Optional)
The app is "invite-only" by default. If you didn't set `ADMIN_EMAIL`, or want to invite others:
1.  Go to your [Firebase Console](https://console.firebase.google.com/) > **Firestore Database**.
2.  Navigate to `app_config` > `security` > `accessControl` > `config`.
3.  Edit the document. Add the email to the `allowedEmails` array field.

---

## Usage Guide

1.  **Settings**: Go to the Settings tab. Upload your "Original CV" (LaTeX format) and fill in your "Extensive CV" (a text dump of everything you've ever done).
    *   **Need to create a LaTeX CV?** Use [Resumake.io](https://resumake.io) - a free online tool to build professional resumes in LaTeX format.
    *   **Want to edit your LaTeX CV?** Use [Overleaf](https://www.overleaf.com) for online LaTeX editing with real-time preview.
    *   **Sample Template**: Check out this [Sample LaTeX CV on Overleaf](https://www.overleaf.com/read/prfgjwdxvxsb#d03be1) to see a compatible structure.
2.  **New Session**: Go to the home page. Paste a Job Description URL or text.
3.  **Generate**: Click "Generate". The AI will research the company, rewrite your CV, and draft a cover letter.
4.  **Download**: Once done, you can download the PDF or copy the text.

---

## Technical Architecture

*For developers, architects, and contributors.*

This project is a **serverless, stateless Next.js application** designed for high availability and security. It runs on the **Next.js App Router (v15)** so the UI, Server Actions, and streaming responses share a single code path, while long-lived state lives in **Firebase** and heavy compute (AI inference) happens inside **Google Gemini**.

### Core Stack

*   **Framework**: Next.js 15 App Router with Server Actions + streaming responses.
*   **Runtime**: Node.js 20-compatible container (Docker/Cloud Run ready).
*   **Database**: Firebase Firestore for sessions, quotas, and configuration.
*   **Object Storage**: Firebase Storage for generated PDFs and structured artifacts.
*   **Authentication**: Firebase Auth + `next-firebase-auth-edge`, backed by an allowlist service.
*   **AI Inference**: Google Gemini 3 Pro (reasoning) + Gemini 2.5 Flash (fast path) via `@google/generative-ai`.
*   **Document Engine**: Hardened LaTeX (`pdflatex`) sandbox with PDF parsing + heuristics.
*   **Observability**: Structured logs mirrored to stdout and Firestore with enforced redaction.

### System Design & Data Flow

```mermaid
flowchart LR
  Client[Client Browser] <-->|Streaming RPC| Actions[Server Actions]
  
  subgraph "Serverless Container (Cloud Run)"
    Actions -->|1. Validate & Hold Quota| Security[Security Module]
    Actions -->|2. Prompt Engineering| AI[AI Service]
    Actions -->|4. Compile & Sanitize| Latex[LaTeX Sandbox]
  end

  subgraph "External Services"
    AI <-->|Inference| Gemini[Google Gemini API]
    AI <-->|Enrichment| Apollo[Apollo.io API]
  end

  subgraph "Persistence Layer"
    Security <-->|Read/Write| Firestore[(Firestore)]
    Latex -->|Upload| Storage[(Firebase Storage)]
  end

  Actions -->|3. Stream Updates| Client
```

### Key Architectural Decisions

#### 1. Hardened LaTeX Engine (`src/lib/document-service.ts`)
Each PDF is rendered inside a throwaway workspace with explicit allow/deny lists.
*   **Sandboxed compilation**: Every run writes sources to `/tmp/cv-latex-*`, invokes `pdflatex` twice, then recursively deletes the directory.
*   **Exploit filtering**: Inputs are scanned for `\write18`, `\openout`, parent-directory includes, and suspicious packages before the compiler runs.
*   **Failure hygiene**: When LaTeX errors occur, the logs/stdout/stderr are hashed (not stored raw) so observability remains useful without leaking governed content.
*   **PDF verification**: `pdf-parse` enforces the configured page target. Mismatch? The workflow loops with corrective instructions to Gemini.

#### 2. Hierarchical Constraint Prompts (HCP)
`src/prompts.json` defines a layered contract so Gemini emits deterministic LaTeX/JSON.
*   **Level 1 (Format)**: Forces pure LaTeX/JSON (no Markdown fences, no chatter).
*   **Level 2 (Structure)**: Dictates sections, ordering, bullet limits, and relational data such as STAR stories.
*   **Level 3 (Content)**: Applies personas and factual constraints so each section references real experience.

#### 3. Input Hardening & Session Metadata
*   **Payload ceilings**: `normalizeFormData` measures every submission byte-for-byte and emits `FormPayloadTooLargeError` once the multi-field payload exceeds ~5× `MAX_CONTENT_LENGTH`.
*   **Field-level limits**: `formSchema` caps each textarea (job description, CVs, strategies, contact info) with descriptive Zod errors so users know what to trim.
*   **Storage sanitation**: `SessionRepository` routes everything through `sanitizeForStorage`, clamps metadata strings to `MAX_CONTENT_LENGTH`, prunes undefined values, and redacts sensitive payloads before persisting chat history.

#### 4. Quota Holds & Streaming Workflow
*   **Optimistic holds**: `quotaService.placeHold` issues a request-scoped hold (1 token by default) before generation starts, keeping global usage fair.
*   **Processing state**: Sessions record `processingStartedAt`, deadlines, and `activeHoldKey`, enabling dashboards to show live progress and ensuring failed runs clean up after themselves.
*   **Streaming UX**: `generateDocumentsAction` wires a readable stream to the client, emitting incremental status updates while the workflow orchestrates RAG, CV rewriting, cover letters, and cold emails.

#### 5. Request-Scoped Logging & Audit
*   **Context propagation**: `registerRequestLogContext` + `runWithRequestIdContext` tie every log line, Firestore entry, and streamed event back to a single `x-request-id`.
*   **Redaction first**: `sanitizeForLogging` trims/labels sensitive data before it ever reaches stdout or Firestore.
*   **Audit trails**: `scheduleChatLog` and `scheduleUsageLog` append structured events to each session so users (and support) can see what happened without combing raw logs.

#### 6. Adaptive AI Routing (`src/lib/ai/model-client.ts`)
*   **Task-aware models**: Fast parsing/labeling tasks hit Gemini Flash, while long-form writing and multi-document reasoning go to Gemini 3 Pro.
*   **Retry policy**: Automatic exponential backoff shields long sessions from transient 429/503 errors, and falls back to alternate models if necessary.

### Internal Logging Endpoint (`/api/log`)

*   **Internal token required**: Every POST must include the `x-internal-token` header that matches `ACCESS_CONTROL_INTERNAL_TOKEN`. Regular authenticated tenants can no longer hit this surface.
*   **Payload guardrails**: Requests larger than ~16KB are rejected upfront with `413`, and the body is streamed/terminated without reaching Firestore.
*   **Per-minute throttling**: Each caller (keyed by `x-log-client`, request id, or IP) can write up to 120 entries/minute before receiving a `429`.
*   **Data hygiene**: `message`/`scope` lengths are validated, log data is sanitized via `sanitizeForLogging` (1KB string cap), nested structures are truncated, and only the scrubbed payload is handed to the shared stdout/Firestore writer.
*   **Operational impact**: Update any custom log forwarders or cron jobs to send `x-internal-token` + a stable `x-log-client` value so the rate limiter buckets traffic predictably.

### Directory Structure

```text
src/
├── app/
│   ├── actions/       # Server Actions (the "Backend API")
│   └── api/           # REST endpoints for webhooks/streaming
├── lib/
│   ├── ai/            # Gemini client & Prompt templates
│   ├── document-service.ts # The LaTeX compiler & sandbox
│   ├── security/      # Quota management & Allowlist logic
│   └── storage/       # Firebase Storage abstraction
├── scripts/           # DevOps & Maintenance utilities
└── prompts.json       # The "Brain" - all AI prompts are centralized here
```

### Environment Layout

| File | Purpose |
| --- | --- |
| `.env.example` | Source of truth. Safe to commit; contains comments + placeholders. |
| `.env.local` | Local development + test scripts. Copy from the example and keep it private. |
| `.env.build` | Deployment/CI inputs. `scripts/build-env-secrets.ts` sanitizes this file and turns the values into secret payloads for Cloud Run/GCP. |

> Tip: Keep `.env.local` and `.env.build` in sync. The only difference should be production URLs or stricter cookie flags.

## Script Commands

### npm scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Boots the tailored dev server (`scripts/dev.ts`): seeds the local vector store when persistence is enabled, then runs `next dev`. |
| `npm run dev:nodemon` | Starts `nodemon` with `nodemon.json` so backend code reloads without the dev bootstrap. |
| `npm run build` | Runs `next build` to produce the production bundle; requires all mandatory env vars (including `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`). |
| `npm run start` | Serves the already-built app with `next start` (use the same env that was present during the build). |
| `npm run lint` | Executes ESLint across the repo. |
| `npm run test` | Runs the Vitest suite in `run` mode. |
| `npm run seed:vector-store` | Manually invokes the vector-store seeding workflow. |
| `npm run deploy` | Runs `scripts/deploy.ts`, which syncs `.env.build` secrets, builds via Cloud Build, and deploys the Cloud Run service. |
| `npm run help` | Prints the curated command reference shown below directly to the terminal. |

Run `npm run help` whenever you need a quick, always-up-to-date reminder of the available scripts.

### Utility scripts (via `npx tsx` unless noted)

| Command | Purpose | Notes |
| --- | --- | --- |
| `npx tsx scripts/build-env-secrets.ts` | Sanitizes `.env.build`, writes `.env.build.clean`, and produces `tmp/secrets/*.txt` plus `tmp/upload-secrets.ps1`. | Run before rotating secrets so `pwsh tmp/upload-secrets.ps1` can push them to Secret Manager. |
| `npx tsx scripts/delete-all-secrets.ts` | Deletes **all** secrets in the active GCP project. | Destructive; useful when resetting a sandbox. |
| `npx tsx scripts/seed-vector-store.ts` | Seeds the recon strategy document into the persisted LlamaIndex store. | `LLAMAINDEX_ENABLE_PERSISTENCE` must be true. |
| `npx tsx scripts/export-prompts.ts` | Regenerates `src/prompts.json` from `src/lib/ai/prompts.ts` with metadata. | Keeps the prompt catalog in sync after edits. |
| `npx tsx scripts/expire-processing.ts` | Marks stuck sessions (past `processingDeadline`) as failed and releases their quota holds. | Safe to run as a cron/Cloud Scheduler task. |
| `npx tsx scripts/clear-firestore-logs.ts --force` | Deletes Firestore log documents in batches. | Requires `--force` (or `-y`) to avoid accidental wipes. |
| `npx tsx scripts/dump-firestore-logs.ts` | Prints the most recent Firestore log entries to stdout. | Respects `FIREBASE_LOG_COLLECTION` and `FIREBASE_LOG_FETCH_LIMIT`. |
| `npx tsx scripts/render-firestore-log-viewer.ts --limit=500` | Renders `tmp/firebase-log-viewer.html`, a searchable DataTables UI for logs. | Adjust `--limit` to trade off size vs. detail. |
| `npx tsx scripts/test-firestore-logging.ts` | Writes an `INFO` log entry into the `appLogs` collection. | Handy for verifying local credentials. |
| `npx tsx scripts/test-gcp-logging.ts` | Same payload as above, intended for Cloud Run/GCP smoke tests. | Run within the deployed environment to confirm IAM/routing. |
| `npx tsx scripts/test-gemini-generation.ts` | Exercises the configured Gemini model(s) with a sample prompt. | Requires `GEMINI_API_KEY` and model env vars in `.env.local`. |
| `npx tsx scripts/test-rag-generation.ts` | Validates the LlamaIndex runtime + embeddings by running a miniature RAG query. | Loads `.env.local` before importing repo code. |
| `node test-fetch.js` | Sends a sample payload to `/api/log` using the internal token. | Set `ACCESS_CONTROL_INTERNAL_TOKEN` in your shell first. |
| `pwsh scripts/remediate-logging.ps1` | Restores Cloud Run logging IAM bindings and checks `_Default` sinks. | Requires the gcloud CLI with project access. |
| `pwsh tmp/upload-secrets.ps1` | Uploads the sanitized secret payloads generated by `scripts/build-env-secrets.ts` to Secret Manager. | Re-run after rotating values inside `.env.build`. |

All scripts assume `corepack enable`/`npm install` has been run so `tsx`, `next`, and related CLIs are available.

## Contributing

We welcome contributions! Please fork the repository and submit a Pull Request.

## License

MIT License
