# CV Customiser (Next.js + Firebase)

AI assistant that builds job-ready CVs, cover letters, and cold emails from a single interface. The Next.js App Router stack orchestrates Gemini prompts, LaTeX rendering, Firebase auth, Firestore session storage, and quota enforcement so the entire system can be deployed on a single VM.

## Table of Contents

1. [Overview](#overview)
2. [Architecture at a Glance](#architecture-at-a-glance)
3. [Prerequisites](#prerequisites)
4. [Required CV Inputs](#required-cv-inputs)
5. [Setup & Installation](#setup--installation)
6. [Running Locally](#running-locally)
7. [Production Deployment](#production-deployment)
8. [Security & Access Control](#security--access-control)
9. [Directory Reference](#directory-reference)
10. [Troubleshooting](#troubleshooting)
11. [Contributing & License](#contributing--license)

## Overview

- 🔥 **Dual workflows** – “Hot” job posting mode and “Cold” company outreach mode share the same chat UI.
- 🧠 **Layered AI prompts** – 12 Gemini prompts coordinate CV surgery, cover-letter drafting, cold-email personalization, recon, and refinement.
- 🧾 **Session persistence** – Firestore stores chat history, artifacts, and quotas so users can resume any conversation.
- 📡 **Streaming feedback** – Server-Sent Events push progress logs into the UI while generation runs.
- 🛡️ **Hardened perimeter** – Firebase auth middleware, internal access tokens, SSRF/IP blocking, and token quotas keep the beta closed.

## Architecture at a Glance

| Layer | Tech | Notes |
| --- | --- | --- |
| Web / API | Next.js 15 (App Router) | Server actions power orchestration.
| Auth | Firebase Auth + secure cookies | Middleware injects UID/email headers and enforces allowlist.
| Data | Firestore + Firebase Storage | Sessions, quotas, allowlist config, and artifacts.
| AI | Google Gemini (Pro/Flash/Embeddings) + Apollo.io (optional) | Prompts live in `src/prompts.json`.
| Rendering | LaTeX via `pdflatex` + Poppler `pdftotext` | Ensures 2-page CV validation.
| Logging | Structured server logger + request-scoped IDs | Internal access-control checks cached for 60s.

## Prerequisites

| Requirement | Windows | macOS | Ubuntu/Debian |
| --- | --- | --- | --- |
| **Node.js 20+** | [nodejs.org](https://nodejs.org) installer | `brew install node@20` | `curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo -E bash -` then `sudo apt install -y nodejs` |
| **Git** | [git-scm.com](https://git-scm.com/download/win) | `brew install git` | `sudo apt install -y git` |
| **pdflatex** | Install [MiKTeX](https://miktex.org/download) | `brew install --cask mactex` | `sudo apt install -y texlive-full` |
| **Poppler (pdftotext)** | [Download package](https://blog.alivate.com.au/poppler-windows/), add `bin` to PATH | `brew install poppler` | `sudo apt install -y poppler-utils` |
| **PowerShell / Bash** | Windows Terminal or PowerShell 5.1+ | Default Terminal | Default shell |

Verify installations:

```bash
node -v
git --version
pdflatex --version
pdftotext -v
```

## Required CV Inputs

The generator expects two source documents before you ever click “Generate”:

1. **Original CV (LaTeX, 2 pages)**
   - This must be valid `.tex` source for the résumé you want Gemini to refactor.
   - We recommend managing it in Overleaf or VS Code + LaTeX Workshop so you can copy the exact source into the app’s **Settings → Original 2-page CV** field.
   - Keep the document constrained to two pages—`DocumentService` enforces `TARGET_PAGE_COUNT=2` and will retry/fail if the layout drifts.

2. **Master / Extensive CV (text dump)**
   - A long-form record of every role, project, metric, certification, publication, etc.
   - Plain text or Markdown is fine; most teams export this from Notion/Google Docs.
   - Paste it into **Settings → Extensive CV Context**. The AI uses it as a knowledge base when tailoring each artifact.

> ✅ Tip: Create a `source_files/master-cv.md` (not checked in) containing your master dump, and a matching `original_cv.tex` you keep in sync with Overleaf. That way a new team member can follow these instructions and drop the same inputs into Settings.

## Setup & Installation

### 1. Clone the repo

```bash
git clone https://github.com/ebenezer-isaac/job-hunt.email.git
cd job-hunt.email
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create `.env.local`

```bash
copy .env.example .env.local   # PowerShell (Windows)
cp .env.example .env.local     # macOS/Linux
```

### 4. Collect credentials & fill `.env.local`

Every variable in `.env.example` is documented inline. The quick-start version for non-engineers:

1. **Google Gemini (content generation)**
   1. Visit <https://makersuite.google.com/app/apikey>.
   2. Click **Create API key**, copy it, and paste into `GEMINI_API_KEY`.
   3. Leave the model names alone unless you have custom access.

2. **Firebase project (auth + data + storage)**
   1. Go to <https://console.firebase.google.com>, click **Add project**, follow the wizard.
   2. Under **Build → Firestore Database**, create a database (production mode).
   3. Under **Build → Storage**, click **Get started** to provision the default bucket.
   4. Open **Project settings → General** → scroll to “Your apps”, add a **Web app**, and copy:
      - `NEXT_PUBLIC_FIREBASE_API_KEY`
      - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
      - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   5. Switch to the **Service accounts** tab, click “Generate new private key”, then copy the JSON values into:
      - `FIREBASE_PROJECT_ID`
      - `FIREBASE_CLIENT_EMAIL`
      - `FIREBASE_PRIVATE_KEY` (keep quotes, replace literal newlines with `\n`).
   6. Storage bucket name (e.g., `my-app.appspot.com`) goes in `FIREBASE_STORAGE_BUCKET`.

3. **Firebase auth cookies (server sessions)**
   - Generate secrets (run in any terminal):
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   - Paste two comma-separated values into `FIREBASE_AUTH_COOKIE_SIGNATURE_KEYS` so you can rotate later.

4. **Apollo.io (optional contact enrichment)**
   - Navigate to <https://app.apollo.io/#/settings/developer> → **Create Key** → assign to `APOLLO_API_KEY`.
   - Skip if you don’t need automatic outreach contacts (the app will fallback gracefully).

5. **Internal access control token**
   - Protects `/api/log` and `/api/internal/*` routes. Generate once:
     ```powershell
     # Windows PowerShell
     [Convert]::ToBase64String((1..48 | % { Get-Random -Maximum 256 }))
     ```
     ```bash
     # macOS / Linux
     head -c 48 /dev/urandom | base64
     ```
   - Paste into both `ACCESS_CONTROL_INTERNAL_TOKEN` and the Firebase Functions/Edge runtime if you deploy elsewhere.

6. **Contact email + repo metadata**
   - Set `CONTACT_EMAIL` and `NEXT_PUBLIC_CONTACT_EMAIL` to the support inbox you want surfaced in the UI.
   - `NEXT_PUBLIC_REPO_URL` should point to your fork if you plan to open-source it.

7. **LaTeX + content tuning**
   - `PDFLATEX_COMMAND` can stay `pdflatex` if it’s globally available; otherwise set an absolute path.
   - `MAX_CONTENT_LENGTH`, `TARGET_PAGE_COUNT`, and `SMOKE_TEST_ALLOWED_EMAILS` rarely need changing, but they are exposed for compliance-heavy orgs.

### 5. Seed access control

The server auto-creates `app_config/security/accessControl/config` on first run, but you must edit it immediately (Firebase Console → Firestore) to include at least one UID/email:

```json
{
  "allowedUids": [],
  "allowedEmails": ["you@example.com"],
  "defaultQuota": 150,
  "holdTimeoutMinutes": 60
}
```

Each authenticated user also needs a profile under `userProfiles/{uid}`. The first login auto-creates one; admins can bump quotas by editing `quota.totalAllocated` and `quota.remaining` plus appending to `allocations`.

### 6. Deploy Firebase security rules

```powershell
firebase deploy --only firestore:rules
```

Rules ensure sessions are owner-scoped and the allowlist doc stays server-only.

## Running Locally

```powershell
# Development server with hot reload
npm run dev

# Type-safe linting (required before PRs)


# Unit / integration tests
npm test

# Production build preview
npm run build
npm start
```

If LaTeX binaries live outside `PATH`, point `PDFLATEX_COMMAND` to the absolute location (e.g., `"C:\\Program Files\\MiKTeX 2.9\\miktex\\bin\\x64\\pdflatex.exe"`).

### Scheduled cleanup

Processing sessions older than 45 minutes are auto-failed and refunded by running:

```powershell
npx tsx scripts/expire-processing.ts
```

Schedule this via cron/Task Scheduler in production.

## Production Deployment

1. **Provision VM** (e.g., GCE e2-micro with Ubuntu 22.04). Open ports 80/443.
2. **Install system deps**:
   ```bash
   sudo apt-get update && sudo apt-get install -y git nodejs npm texlive-full poppler-utils
   ```
3. **Clone & install**:
   ```bash
   git clone https://github.com/ebenezer-isaac/job-hunt.email.git
   cd job-hunt.email
   npm ci
   ```
4. **Add `.env.local`** (copy via SCP or secret manager).
5. **Build once**: `npm run build`.
6. **Run under a process manager**:
   ```bash
   npm install -g pm2
   pm2 start npm --name job-hunt.email -- start
   pm2 save
   ```
7. **Serve over HTTPS** using nginx/Cloud Load Balancer or a managed TLS endpoint.

## Security & Access Control

- 🔐 **Closed beta** – middleware calls `/api/internal/access-control/check` with `ACCESS_CONTROL_INTERNAL_TOKEN` to enforce the Firestore allowlist and token quotas before every request.
- 🧮 **Quota holds** – generation places a 1-token hold; success commits it, failures refund it (plus the cleanup job guards against timeouts).
- 🌐 **SSRF guardrails** – outbound fetches resolve DNS → IP, block loopback/private/link-local ranges, and enforce allowlists.
- 🧪 **Request IDs everywhere** – middleware injects `x-request-id`, allowing logs to be correlated across middleware, route handlers, and storage writes.
- 📑 **Audit logging** – `/api/log` captures server logs only when both an authenticated user and internal token are present.

## Directory Reference

```
job-hunt.email/
├── README.md                  # This file (root-level overview)
├── src/
│   ├── app/               # App Router routes, API handlers, server actions
│   ├── components/        # UI building blocks
│   ├── hooks/             # Client hooks (`useChat`, quota subscriptions,etc.)
│   ├── lib/               # Auth, AI, logging, Firebase, quota, storage helpers
│   ├── middleware.ts      # Firebase auth + access-control gate
│   └── env.ts             # Zod-validated environment schema
├── scripts/               # Maintenance tasks (export prompts, expire holds)
├── source_files/          # CV/cover-letter/cold-email strategy corpora
├── public/                # Static assets served by Next.js
└── .env.local 
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `ACCESS_CONTROL_INTERNAL_TOKEN` missing during `npm run build` | Generate a 32+ char secret (see setup step 6) and add it to `.env.local`. |
| `pdflatex exited with code ...` | Ensure MiKTeX/TeX Live is installed and reachable; set `PDFLATEX_COMMAND` to the full path if needed. |
| `ENOENT: pdftotext` | Poppler utilities are missing; install `poppler-utils`/`brew install poppler`/download Windows binaries. |
| Firebase `permission-denied` | Confirm service account has Firestore + Storage roles and deploy the provided `firestore.rules`. |
| Users stuck on login loop | Check the allowlist doc (`app_config/security/accessControl/config`) and confirm their UID/email is allowed. |
| Token quota never refunds | Run `npx tsx scripts/expire-processing.ts` or inspect Firestore for stuck `sessions` with `processingDeadline` in the past. |

## Contributing & License

- Run `npm run lint && npm test` before opening a PR.
- Keep secrets out of commits; `.env.local` is ignored.
- Document new environment variables or scripts in this README.

Licensed under the **MIT License**.