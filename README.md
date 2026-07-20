# Safeship 🛡️

**Is your code safe to ship?** Safeship is a friendly security co-pilot for people who build with AI tools. Connect a GitHub repo and it scans the code for **leaked secrets**, **insecure code patterns**, and **vulnerable dependencies** — then explains every finding in plain English, ranked by real-world risk, with a copy-paste fix.

> **Safety boundary:** Safeship performs **static code analysis only**. It reads source code you authorize via GitHub. It never attacks, probes, port-scans, or sends traffic to any live system.

**100% free to run and deploy — no paid tiers, no credit card.** The web app is hosted on Vercel's free tier, scans run on GitHub Actions' free runners, the database is Supabase's free Postgres, and AI explanations use Groq's free API.

---

## Architecture

Safeship is split so it can be free *and* public. The security engines are heavy CLI binaries that need a real machine — Vercel's serverless functions can't run them. So the app hands the actual scan to a **GitHub Actions runner** (a free, on-demand Linux machine) and just orchestrates + displays results.

```
  ┌──────────── Vercel (free) ────────────┐        ┌──── GitHub Actions (free runner) ────┐
  │  UI · login · dashboard · report       │        │  .github/workflows/scan.yml          │
  │                                        │        │   1. install gitleaks/osv/semgrep    │
  │  POST /api/scan  ──repository_dispatch────────► │   2. git clone target repo           │
  │    creates Scan row, triggers workflow │        │   3. run engines → normalize         │
  │                                        │        │   4. redact secrets                  │
  │  POST /api/scan/callback  ◄──findings──────────│   5. POST redacted findings back      │
  │    persists findings + score           │        │   6. runner destroyed (clone gone)   │
  │                                        │        └──────────────────────────────────────┘
  │  GET /api/scan/[id]  (report polls)    │
  │  Groq explains each finding on open    │
  └────────────────┬───────────────────────┘
                   ▼
          Supabase Postgres (free)   ·   Groq LLM (free)   ·   GitHub OAuth (free)
```

Because the engines run on Linux, **all three run in production** — including semgrep, which has no native Windows build.

---

## What's under the hood

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Hosting | **Vercel** (free) |
| Auth | Auth.js (NextAuth v5) — GitHub OAuth |
| Database | Prisma 6 + **Postgres (Supabase)** |
| Scan execution | **GitHub Actions** (free runner) |
| Secret scanning | [gitleaks](https://github.com/gitleaks/gitleaks) |
| Code (SAST) | [semgrep](https://semgrep.dev) |
| Dependency vulns | [osv-scanner](https://github.com/google/osv-scanner) |
| AI explanations | **Groq** (cloud, prod default) or Ollama (local) — swappable |

---

## How a scan works

```
click Scan
  → app creates a Scan row (status=running) and fires a repository_dispatch at the scan repo
  → GitHub Actions runner: clone (shallow) → run engines → normalize → REDACT secrets
  → runner POSTs redacted findings to /api/scan/callback (authenticated with a shared secret)
  → app persists findings + computes the safety score → status=done
  → the report page (polling) shows results; opening a finding fetches a plain-language
    AI explanation + fix from Groq on demand (lazy)
```

Security guarantees:
- **Secrets are redacted** (`<REDACTED_SECRET>`) **on the runner**, before findings ever leave it — the raw value is never transmitted, stored, or sent to the LLM.
- The **cloned code lives only on the ephemeral runner** and is destroyed when the job ends.
- Only a **minimal, redacted** finding is sent to the AI — never whole files.
- The GitHub token is stored **server-side only** and never sent to the browser.
- The callback is authenticated with a shared secret so nobody can inject fake findings.

The safety score starts at 100 and subtracts weighted penalties per finding
(critical −25, high −12, medium −5, low −1, floored at 0).

---

## Deploying your own (Vercel + GitHub Actions + Supabase + Groq)

All free, no credit card. You'll set up four services and wire them with env vars.

### 1. Database — Supabase (free)
1. Create a project at [supabase.com](https://supabase.com). **Disable the Data API** in project settings (Safeship uses Prisma's direct connection, not the REST API).
2. From **Settings → Database → Connection string**, copy the **pooled** (port 6543) and **direct** (port 5432) URLs.
3. Run the migration against it (locally, once):
   ```bash
   # put the two URLs in .env as DATABASE_URL (pooled) and DIRECT_URL (direct)
   npx prisma migrate deploy
   ```

### 2. GitHub OAuth app — production (free)
Create an OAuth app at <https://github.com/settings/developers>:
- **Homepage URL:** `https://<your-app>.vercel.app`
- **Authorization callback URL:** `https://<your-app>.vercel.app/api/auth/callback/github`

Keep a **separate** OAuth app for local dev (callback `http://localhost:3000/...`) — a GitHub OAuth app allows only one callback URL.

### 3. Groq API key (free)
Get a key at <https://console.groq.com/keys>.

### 4. Vercel — deploy + env vars
Import the repo at [vercel.com](https://vercel.com), then set these **Environment Variables** (Production):

| Variable | Value |
|---|---|
| `AUTH_SECRET` | `npx auth secret` (any stable random string) |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | your **prod** OAuth app credentials |
| `AUTH_URL` | `https://<your-app>.vercel.app` |
| `DATABASE_URL` | Supabase **pooled** URL (`:6543`, keep `?pgbouncer=true&connection_limit=1`) |
| `DIRECT_URL` | Supabase **direct** URL (`:5432`) |
| `LLM_PROVIDER` | `groq` |
| `GROQ_API_KEY` / `GROQ_MODEL` | your Groq key / `llama-3.3-70b-versatile` |
| `GITHUB_DISPATCH_TOKEN` | a GitHub PAT with `repo` scope (lets the app trigger the workflow) |
| `GITHUB_SCAN_REPO` | the repo holding `scan.yml`, e.g. `you/Safeship` |
| `SCAN_CALLBACK_SECRET` | any random string (verifies the runner's callback) |
| `APP_URL` | *optional* — defaults to the request origin |

### 5. GitHub Actions secret
On the repo that holds `.github/workflows/scan.yml`: **Settings → Secrets and variables → Actions → New repository secret** →
`SCAN_CALLBACK_SECRET` = **the same value** you set on Vercel.

Redeploy, sign in, and scan. 🎉

---

## Local development

Local dev is mainly for UI/pipeline work.

```bash
npm install
cp .env.example .env     # fill in DATABASE_URL/DIRECT_URL (Supabase), AUTH_*, LLM vars
npx prisma generate
npm run dev              # http://localhost:3000
```

Notes:
- The **dashboard Scan button dispatches to GitHub Actions**, and the runner POSTs back to a public URL — so a full scan can't complete against plain `localhost` (the callback can't reach it). Test the full flow on the deployed app, or expose your local callback with a tunnel.
- To exercise the **engine pipeline locally** (runs the binaries inline, no Actions), use the scripts below — this is the fastest way to work on detection/redaction.

---

## Testing the internals (no GitHub sign-in needed)

Run the engines **inline** against a planted fixture. Requires the engines installed locally
(`gitleaks`, `osv-scanner`, `semgrep` — semgrep needs Linux/WSL/Docker on Windows):

```bash
# Engines against a planted fixture (fake secret + vulnerable dependency)
node --env-file=.env --import tsx scripts/test-scan.ts

# LLM layer: redaction, fallback, and a live model round-trip
node --env-file=.env --import tsx scripts/test-llm.ts

# Full pipeline end-to-end (writes + cleans up a test scan in the DB)
node --env-file=.env --import tsx scripts/test-pipeline.ts

# Standalone scanner CLI (what the GitHub Actions runner executes)
node --import tsx scanner/run.ts --repo https://github.com/owner/repo
```

Inspect the database anytime with `npx prisma studio`.

---

## Switching LLM providers

The AI layer is swappable via `LLM_PROVIDER` — no code changes.

- **Groq** (`groq`) — free cloud API, used in production. Needs `GROQ_API_KEY` + `GROQ_MODEL`.
- **Ollama** (`ollama`) — fully local/offline. Needs Ollama running + `OLLAMA_BASE_URL` / `OLLAMA_MODEL`.

If no LLM is reachable, scans still complete — findings show the engine's raw message with a note that the AI explanation is unavailable.

---

## Project structure

```
Safeship/
├── BUILD.md                     # original product spec
├── MIGRATION_PLAN.md            # design of the Vercel + Actions + Supabase + Groq split
├── PROGRESS.md                  # build log
├── .github/workflows/scan.yml   # the scan workflow (runs the engines on a runner)
├── scanner/run.ts               # standalone scanner CLI the workflow invokes
├── prisma/schema.prisma         # User / Scan / Finding models (Postgres)
├── scripts/                     # inline test harnesses + shared fixture
└── src/
    ├── app/                     # pages (/, /dashboard, /scan/[id]) + API routes
    │   └── api/scan/            # route.ts (dispatch), callback/route.ts (persist)
    ├── auth.ts                  # NextAuth v5 config (GitHub)
    ├── components/              # RepoList, ScanReport, AuthButtons, Logo
    └── lib/
        ├── db.ts                # Prisma client
        ├── engines/             # gitleaks / semgrep / osv wrappers
        ├── llm/                 # swappable LLM layer + secret redaction
        └── scan/                # engineScan (extracted core), dispatch, scoring
```
