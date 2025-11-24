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
You need to generate two secure random strings for security.
Run this in your terminal (Node.js required):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
*   Copy the output and paste it into `.env.local` for `ACCESS_CONTROL_INTERNAL_TOKEN`.
*   Run it again and paste it for `FIREBASE_AUTH_COOKIE_SIGNATURE_KEYS`.

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

This project is a **serverless, stateless Next.js application** designed for high availability and security. It leverages the **Next.js App Router** for the frontend and API layer, while offloading state to **Firebase** and heavy compute (AI inference) to **Google Gemini**.

### Core Stack

*   **Framework**: Next.js 14 (App Router) - *Server Actions for backend logic.*
*   **Runtime**: Node.js 18+ (Compatible with Cloud Run / Docker).
*   **Database**: Firebase Firestore - *NoSQL document store for sessions and user profiles.*
*   **Object Storage**: Firebase Storage - *Persists generated PDFs and text artifacts.*
*   **Authentication**: Firebase Auth + `next-firebase-auth-edge` - *Edge-compatible JWT validation.*
*   **AI Inference**: Google Gemini Pro (Reasoning) & Flash (Speed).
*   **Document Engine**: LaTeX (`pdflatex`).

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

#### 1. The "Surgical" LaTeX Engine (`src/lib/document-service.ts`)
Unlike typical HTML-to-PDF converters, this project uses **LaTeX** for professional typesetting.
*   **Sandboxed Compilation**: Every compilation request spawns a fresh, isolated temporary directory (`/tmp/cv-latex-xyz`).
*   **Security Hardening**: The compiler explicitly blocks RCE vectors. We scan for and reject dangerous primitives like `\write18` (shell execution), `\openout` (file writing), and `\usepackage{shellesc}` before the compiler ever runs.
*   **Double-Pass Compilation**: `pdflatex` is invoked twice per document to correctly resolve cross-references and layout calculations.
*   **Page Count Heuristics**: The system uses `pdf-parse` to inspect the generated PDF. If the output deviates from the target (e.g., 2 pages), it triggers a **self-correction loop** where the AI is fed the error and asked to condense or expand the content.

#### 2. Hierarchical Constraint Prompts (HCP)
We don't just ask the AI to "write a CV." We use a strict prompting framework defined in `src/prompts.json`.
*   **Level 1 (Format)**: Enforces strict JSON or raw LaTeX output (no Markdown blocks).
*   **Level 2 (Structure)**: Defines the exact schema or document layout.
*   **Level 3 (Content)**: The actual creative task (e.g., "Map these 3 keywords to the candidate's experience").
*   **Persona Injection**: The AI adopts specific personas (e.g., "Dr. Sarah Chen, PhD in IO Psychology") to maintain a consistent, professional tone across different tasks.

#### 3. Edge-Compatible Authentication
We use `next-firebase-auth-edge` in `src/middleware.ts`.
*   **Zero-Latency Auth**: Authentication is verified at the edge before the request hits the server container.
*   **Custom Claims**: We use custom claims and Firestore lookups to enforce an "Invite-Only" allowlist system, preventing unauthorized usage of your API keys.

#### 4. Robust AI Client (`src/lib/ai/model-client.ts`)
*   **Model Routing**: Simple tasks (parsing job descriptions) are routed to **Gemini Flash** for speed and cost-efficiency. Complex reasoning (writing cover letters, strategic analysis) goes to **Gemini Pro**.
*   **Resiliency**: The client implements exponential backoff for `429` (Rate Limit) and `503` (Service Unavailable) errors, ensuring long-running batch jobs don't fail due to transient API hiccups.

### Internal Logging Endpoint (`/api/log`)

*   **Internal token required**: Every POST must include the `x-internal-token` header that matches `ACCESS_CONTROL_INTERNAL_TOKEN`. Regular authenticated tenants can no longer hit this surface.
*   **Payload guardrails**: Requests larger than ~16KB are rejected upfront with `413`, and the body is streamed/terminated without reaching Firestore.
*   **Per-minute throttling**: Each caller (keyed by `x-log-client`, request id, or IP) can write up to 120 entries/minute before receiving a `429`.
*   **Data hygiene**: `message`/`scope` lengths are validated, log data is sanitized via `sanitizeForLogging` (1KB string cap), nested structures are truncated, and the stdout mirror only emits the sanitized payload.
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

## Contributing

We welcome contributions! Please fork the repository and submit a Pull Request.

## License

MIT License
