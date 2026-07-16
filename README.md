# Safeship 🛡️

**Is your code safe to ship?** Safeship (a.k.a. **ShipSafe**) is a friendly security co-pilot for people who build with AI tools. Connect a GitHub repo and it scans the code for **leaked secrets**, **insecure code patterns**, and **vulnerable dependencies** — then explains every finding in plain English, ranked by real-world risk, with a copy-paste fix.

> **Safety boundary:** Safeship performs **static code analysis only**. It reads source code you authorize via GitHub. It never attacks, probes, port-scans, or sends traffic to any live system.

Everything runs locally and is **100% free** — open-source scan engines plus a local AI model (Ollama). No paid APIs, no credit card required.

---

## What's in this repo

```
Safeship/
├── BUILD.md        # the original product spec / build guide
├── PROGRESS.md     # build log (what was done, decisions made)
└── shipsafe/       # the actual Next.js application  ← start here
    └── README.md   # full setup & run instructions
```

👉 **To run the app, see [`shipsafe/README.md`](./shipsafe/README.md).** Quick version:

```bash
cd shipsafe
npm install
cp .env.example .env          # then set AUTH_SECRET + GitHub OAuth creds
npx prisma migrate dev
npm run dev                    # http://localhost:3000
```

You'll also need the scan engines (`gitleaks`, `osv-scanner`, optionally `semgrep`) and, for local AI explanations, [Ollama](https://ollama.com) with a model pulled (`ollama pull llama3.2`). Full details, including how to create the free GitHub OAuth app and how to switch the AI provider to Groq, are in the app README.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Auth | Auth.js (NextAuth v5) — GitHub OAuth |
| Database | Prisma 6 + SQLite (dev) |
| Secret scanning | [gitleaks](https://github.com/gitleaks/gitleaks) |
| Code analysis (SAST) | [semgrep](https://semgrep.dev) |
| Dependency vulns | [osv-scanner](https://github.com/google/osv-scanner) |
| AI explanations | Ollama (local, default) or Groq (cloud) — swappable via one env var |

Every tool above is free and open source. The whole thing runs at **$0** locally.

---

## How a scan works

```
clone (shallow) → run engines → normalize findings → redact secrets
   → LLM explains + ranks + suggests fixes → compute safety score → save → delete clone
```

- **Secrets are redacted** (`<REDACTED_SECRET>`) before anything is stored, logged, or sent to the AI.
- Only a **minimal, redacted** finding is sent to the AI — never whole files.
- The **cloned code is always deleted** after a scan (even on failure).
- The GitHub token is stored **server-side only** and never reaches the browser.

---

## Status

MVP complete and verified: engine wrappers, AI explanation layer (with redaction + graceful
fallback), the end-to-end scan pipeline, GitHub auth, the API, and the full UI (dashboard +
live-polling report). Production build passes. See [`PROGRESS.md`](./PROGRESS.md) for the detailed log.

The one manual step to run the live sign-in flow is creating a free GitHub OAuth app — see the
app README.

## Deploying

Safeship shells out to CLI binaries, clones repos to disk, and runs multi-minute jobs, so
**serverless (e.g. Vercel) is not a good fit**. Deploy to a small always-on Linux VM
(Fly.io / Render / Railway / any ~$5-mo box) and set `LLM_PROVIDER=groq` in production
(a local Ollama isn't reachable from the cloud).
