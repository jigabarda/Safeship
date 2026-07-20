# Safeship 🛡️

**Is your code safe to ship?** Safeship is a friendly security co-pilot for people who build with AI tools. Connect a GitHub repo and it scans the code for **leaked secrets**, **insecure code patterns**, and **vulnerable dependencies** — then explains every finding in plain English, ranked by real-world risk, with a copy-paste fix.

> **Safety boundary:** Safeship performs **static code analysis only**. It reads source code you authorize via GitHub. It never attacks, probes, port-scans, or sends traffic to any live system.

---

## Architecture

The security engines are heavy CLI binaries that need a real machine, so the web app doesn't run them directly. It hands each scan to a **GitHub Actions runner** — an on-demand Linux machine — and just orchestrates and displays the results.

```
  ┌──────────── Web app (Vercel) ─────────┐        ┌──── GitHub Actions runner ───────────┐
  │  UI · login · dashboard · report       │        │   1. install gitleaks/osv/semgrep    │
  │  POST /api/scan  ──repository_dispatch────────► │   2. clone target repo               │
  │    creates a scan, triggers the run    │        │   3. run engines → normalize         │
  │  POST /api/scan/callback  ◄──findings──────────│   4. redact secrets → POST back       │
  │    persists findings + score           │        │   5. runner destroyed (clone gone)   │
  │  Report polls; AI explains on demand   │        └──────────────────────────────────────┘
  └────────────────┬───────────────────────┘
                   ▼
           Postgres  ·  LLM (Groq/Ollama)  ·  GitHub OAuth
```

Because the engines run on Linux, all three run in production — including semgrep, which has no native Windows build.

---

## Under the hood

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Hosting | Vercel |
| Auth | Auth.js (NextAuth v5) — GitHub OAuth |
| Database | Prisma 6 + Postgres (Supabase) |
| Scan execution | GitHub Actions |
| Secret scanning | [gitleaks](https://github.com/gitleaks/gitleaks) |
| Code (SAST) | [semgrep](https://semgrep.dev) |
| Dependency vulns | [osv-scanner](https://github.com/google/osv-scanner) |
| AI explanations | Groq (cloud) or Ollama (local) — swappable via `LLM_PROVIDER` |

---

## How a scan works

```
click Scan → app creates a Scan row and triggers the GitHub Actions workflow
  → runner: clone → run engines → normalize → REDACT secrets → POST findings back
  → app persists findings + computes a safety score
  → report shows results; opening a finding fetches a plain-language AI explanation + fix
```

- **Secrets are redacted on the runner**, before any finding leaves it — raw values are never stored, transmitted, or sent to the LLM.
- The **cloned code lives only on the ephemeral runner** and is destroyed when the job ends.
- The GitHub token is stored **server-side only** and never sent to the browser.
- The callback is authenticated with a shared secret.

The safety score starts at 100 and subtracts weighted penalties per finding (critical −25, high −12, medium −5, low −1, floored at 0).

---

## Project structure

```
Safeship/
├── .github/workflows/scan.yml   # the scan workflow (runs the engines on a runner)
├── scanner/run.ts               # standalone scanner CLI the workflow invokes
├── prisma/schema.prisma         # User / Scan / Finding models
└── src/
    ├── app/                     # pages (/, /dashboard, /scan/[id]) + API routes
    │   └── api/scan/            # route.ts (dispatch), callback/route.ts (persist)
    ├── auth.ts                  # NextAuth v5 config (GitHub)
    ├── components/              # RepoList, ScanReport, AuthButtons, Logo
    └── lib/
        ├── engines/             # gitleaks / semgrep / osv wrappers
        ├── llm/                 # swappable LLM layer + secret redaction
        └── scan/                # engineScan (core), dispatch, scoring
```
