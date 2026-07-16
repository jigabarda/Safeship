# Safeship 🛡️

**Is your code safe to ship?** Safeship is a friendly security co-pilot for people who build with AI tools. Connect a GitHub repo and it scans the code for **leaked secrets**, **insecure code patterns**, and **vulnerable dependencies** — then explains every finding in plain English, ranked by real-world risk, with a copy-paste fix.

> **Safety boundary:** Safeship performs **static code analysis only**. It reads source code you authorize via GitHub. It never attacks, probes, port-scans, or sends traffic to any live system.

Everything runs locally and is **100% free** — open-source scan engines plus a local AI model (Ollama). No paid APIs, no credit card.

---

## What's under the hood

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Auth | Auth.js (NextAuth v5) — GitHub OAuth |
| Database | Prisma 6 + SQLite (dev) |
| Secret scanning | [gitleaks](https://github.com/gitleaks/gitleaks) |
| Code (SAST) | [semgrep](https://semgrep.dev) |
| Dependency vulns | [osv-scanner](https://github.com/google/osv-scanner) |
| AI explanations | Ollama (local, default) or Groq (cloud) — swappable |

---

## Prerequisites

- **Node.js 20+** and **git**
- The scan engines (install what you can; Safeship degrades gracefully and shows a banner for any that are missing):

| Engine | macOS / Linux | Windows |
|---|---|---|
| gitleaks | `brew install gitleaks` | `winget install Gitleaks.Gitleaks` |
| osv-scanner | `brew install osv-scanner` | `winget install Google.OSVScanner` |
| semgrep | `pip install semgrep` | ⚠️ no native Windows build — use WSL/Docker, or run on Linux/macOS |

- **A local AI model** (default provider) — install [Ollama](https://ollama.com), then pull a model:
  ```bash
  ollama pull llama3.2
  ```
  Prefer a hosted model instead? See [Switching LLM providers](#switching-llm-providers).

> **Windows note:** if an engine isn't on your `PATH` after install, set its absolute path in `.env`
> (`GITLEAKS_PATH`, `OSV_SCANNER_PATH`, `SEMGREP_PATH`).

---

## Setup (zero to running)

```bash
# 1. Install dependencies
npm install

# 2. Create your env file
cp .env.example .env

# 3. Generate an auth secret and paste it into .env as AUTH_SECRET
npx auth secret            # or: openssl rand -base64 32

# 4. Create the database
npx prisma migrate dev

# 5. Start the app
npm run dev
```

Then open **http://localhost:3000**.

### Create a GitHub OAuth app (free)

Sign-in needs a GitHub OAuth app (takes ~2 minutes, no cost):

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
   (<https://github.com/settings/developers>).
2. Set:
   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** `http://localhost:3000/api/auth/callback/github`
3. Create it, then copy the **Client ID** and generate a **Client secret**.
4. Put them in `.env`:
   ```
   AUTH_GITHUB_ID="your-client-id"
   AUTH_GITHUB_SECRET="your-client-secret"
   ```
5. Restart `npm run dev`.

---

## Using it

1. **Sign in with GitHub** on the landing page.
2. On the **dashboard**, pick a repository and click **Scan**.
3. Watch the scan progress, then read the **report**: an overall safety score, findings grouped
   into 🔴 Fix now / 🟠 Should fix / 🟡 Minor, each with a plain-language explanation and a copy-able fix.

---

## Switching LLM providers

The AI layer is swappable via one env var — no code changes.

**Ollama (default — local, free, private):**
```
LLM_PROVIDER="ollama"
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="llama3.2"
```

**Groq (free cloud API, faster/higher-quality; recommended when deployed):**
```
LLM_PROVIDER="groq"
GROQ_API_KEY="your-free-key"     # from https://console.groq.com/keys
GROQ_MODEL="llama-3.3-70b-versatile"
```

If no LLM is reachable, scans still complete — findings show the engine's raw
message with a note that the AI explanation is unavailable.

---

## How a scan works

```
clone (shallow) → run engines → normalize findings → redact secrets
   → LLM explains + ranks + suggests fixes → compute score → save → delete clone
```

- **Secrets are redacted** (`<REDACTED_SECRET>`) before anything is stored, logged, or sent to the LLM.
- Only a **minimal, redacted** finding is sent to the AI — never whole files.
- The **cloned code is always deleted** after a scan (even on failure).
- The GitHub token is stored **server-side only** and never sent to the browser.

The safety score starts at 100 and subtracts weighted penalties per finding
(critical −25, high −12, medium −5, low −1, floored at 0).

---

## Testing the internals (no GitHub needed)

These scripts exercise the core without signing in:

```bash
# Engines against a planted fixture (fake secret + vulnerable dependency)
node --env-file=.env --import tsx scripts/test-scan.ts

# LLM layer: redaction, fallback, and a live model round-trip
node --env-file=.env --import tsx scripts/test-llm.ts

# Full pipeline end-to-end (writes + cleans up a test scan in the DB)
node --env-file=.env --import tsx scripts/test-pipeline.ts
```

Inspect the database anytime with `npx prisma studio`.

---

## Deploying (later)

Safeship shells out to CLI binaries, clones repos to disk, and runs multi-minute
jobs — so **serverless platforms (e.g. Vercel) are not a good fit**. Deploy to a
small always-on VM (Fly.io, Render, Railway, or any $5/mo Linux box) where you can
install the engines. Since a local Ollama isn't reachable from the cloud, set
`LLM_PROVIDER=groq` in production. The Prisma schema is portable to free Postgres
(Neon/Supabase) when you outgrow SQLite.

---

## Project structure

```
shipsafe/
├── prisma/schema.prisma       # User / Scan / Finding models
├── scripts/                   # test harnesses + shared fixture
└── src/
    ├── app/                   # pages (/, /dashboard, /scan/[id]) + API routes
    ├── auth.ts                # NextAuth v5 config (GitHub)
    ├── components/            # RepoList, ScanReport, AuthButtons
    └── lib/
        ├── db.ts              # Prisma client
        ├── engines/           # gitleaks / semgrep / osv wrappers + availability
        ├── llm/               # swappable LLM layer + secret redaction
        └── scan/              # runScan pipeline + scoring/ordering
```
