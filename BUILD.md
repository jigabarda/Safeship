# BUILD.md — ShipSafe: Autonomous Build Guide

> **You are an AI developer agent. Read this entire file, then build the product it describes from scratch to a working, verified MVP.**
> This document is your single source of truth. Everything you need to build ShipSafe is here. Do not ask for clarification unless you hit a genuine blocker that this file does not answer — instead, follow the plan, make reasonable choices consistent with the constraints, and keep going.

---

## 0. How to use this file (agent instructions)

1. Read this whole document first. Do not start coding until you understand the full plan.
2. Build **phase by phase, in order** (Phase 0 → 7). Do not skip ahead.
3. At the end of **every phase**, run that phase's **Acceptance Check** and confirm it passes before moving on. If it fails, fix it before proceeding.
4. Keep a running progress log in `PROGRESS.md` at the repo root — append one line per completed step with a timestamp-free checkmark (e.g. `- [x] Phase 1: scan engine wrapper working`).
5. Commit after each phase with a clear message (`git commit -m "Phase N: <summary>"`).
6. **Hard constraint: everything must be free.** Never introduce a paid service, paid API, or anything requiring a credit card. See §2. If a step seems to require payment, use the free alternative named in this file.
7. Prefer boring, well-documented, popular tools over clever ones. This must be maintainable by a non-expert.
8. When you finish Phase 7, run the **Final Verification** in §12 and write a `README.md` explaining how to run the app.

---

## 1. What we are building

**ShipSafe** — a security co-pilot for "vibe coders" and AI-assisted developers.

**The problem:** People building apps with AI tools (Cursor, Claude Code, Lovable, v0, etc.) ship a lot of code they don't fully read. They leak API keys, commit secrets, use insecure defaults, and pull in vulnerable dependencies — without realizing it.

**The product:** A web app where a developer connects their GitHub repository, and ShipSafe:
1. **Scans the code** using proven open-source security engines (no attacking of live systems — this is *static* analysis of code only).
2. **Explains findings in plain English**, written for someone who is NOT a security expert.
3. **Ranks findings** by real-world risk (🔴 fix now / 🟠 should fix / 🟡 minor).
4. **Suggests concrete fixes** — a copy-paste snippet or a diff the user can apply.

**What ShipSafe is NOT (critical safety boundary):**
- It does **NOT** attack, probe, or send traffic to any live/running system.
- It does **NOT** do penetration testing, port scanning, or exploitation.
- It **only reads source code** that the user has authorized via GitHub. That's it.
- This keeps the product legal, safe, and free of abuse potential. Do not add "live scanning" features.

**Target user:** solo devs and small teams building with AI, who want a friendly "is my code safe to ship?" check.

---

## 2. Non-negotiable constraints

| Constraint | Rule |
|---|---|
| **Cost** | 100% free. No paid APIs, no credit-card signups, no paid tiers. Everything runs locally or on free tiers. |
| **LLM** | Use a **free** LLM provider behind a swappable interface (see §7). Default to a free-tier hosted API; support fully-local (Ollama) as a fallback. |
| **Scope** | Static code analysis only. Never scan/attack live systems. |
| **Stack** | Use the stack in §4. Do not substitute paid equivalents. |
| **Data** | The user's code is sensitive. Never send full source files to any third party except the minimal snippet needed for the LLM to explain/fix a finding. Never log secrets that are found — redact them. |
| **Simplicity** | MVP first. Ship the smallest thing that works, then expand. |

---

## 3. Architecture (MVP)

```
┌───────────────────────────────────────────────┐
│  Next.js app (App Router) — single repo        │
│                                                │
│  ┌──────────────┐        ┌──────────────────┐  │
│  │  UI (React)  │◄──────►│  API routes       │  │
│  │  - login     │        │  - /auth (GitHub) │  │
│  │  - repo list │        │  - /scan          │  │
│  │  - report    │        │  - /findings      │  │
│  └──────────────┘        └────────┬──────────┘  │
│                                   │             │
│         ┌─────────────────────────▼──────────┐  │
│         │  Scan service (server-side)         │  │
│         │  1. clone repo (shallow) to tmp     │  │
│         │  2. run engines (CLI child procs):  │  │
│         │       gitleaks, semgrep, osv-scanner│  │
│         │  3. normalize findings → JSON       │  │
│         │  4. LLM layer: explain + rank + fix │  │
│         │  5. store results, delete clone     │  │
│         └─────────────────────────┬──────────┘  │
│                                   │             │
│              ┌────────────────────▼───────────┐ │
│              │  DB (Prisma + SQLite in dev)    │ │
│              │  users, repos, scans, findings  │ │
│              └────────────────────────────────┘ │
└───────────────────────────────────────────────┘
        │                              │
        ▼                              ▼
  GitHub OAuth (free)          Free LLM API (§7)
```

**Why this shape:** one Next.js repo is the least infrastructure. The scan runs server-side as a background job kicked off by an API route. SQLite means zero database setup cost in development.

---

## 4. Tech stack (all free)

| Layer | Choice | Why / free-ness |
|---|---|---|
| Framework | **Next.js 15 (App Router), JavaScript or TypeScript** | Free, one repo for UI + API. TypeScript preferred for safety. |
| UI | **React 18 + Tailwind CSS** | Free. Tailwind for fast, clean styling. |
| Auth | **Auth.js (NextAuth v5) with GitHub OAuth provider** | Free. GitHub OAuth apps are free. |
| DB | **Prisma ORM + SQLite (dev)** | Zero-cost, zero-setup. Schema is portable to free Postgres (Neon/Supabase) later. |
| Git ops | **`git` CLI via `simple-git`** or child process | Free. Shallow clone only. |
| Secret scan | **gitleaks** (binary) | Free, MIT. |
| SAST | **semgrep** (CLI) with community/open rules | Free. Use `--config auto` or a curated ruleset. |
| Dependency vulns | **osv-scanner** (Google, binary) | Free, Apache-2.0. |
| Job handling (MVP) | In-process async (a simple queue table + a runner). No paid queue. | Free. Upgrade to a real queue only if needed later. |
| LLM | **Free provider behind an abstraction** — default **Groq free API** (fast, free) or **Google Gemini free tier**; fallback **Ollama** (fully local). OpenAI-compatible client. | Free. See §7. |
| Deploy (optional, later) | Vercel free tier / Fly.io free allowance / Render free / fully local | Free tiers only. MVP runs locally. |

**Install the engines** (document these in README; the app should also detect if they're missing and show a friendly message):
- gitleaks: `brew install gitleaks` (mac) or download binary from its GitHub releases
- semgrep: `pip install semgrep` or `brew install semgrep`
- osv-scanner: `brew install osv-scanner` or download binary

---

## 5. Repository layout

Create this structure inside the current folder (`untitled/`). The app itself lives in a `shipsafe/` subfolder so this BUILD.md and progress files stay at the top:

```
untitled/
├── BUILD.md                 ← this file (do not modify)
├── PROGRESS.md              ← you append progress here
├── shipsafe/                ← the Next.js app
│   ├── README.md            ← you write this (how to run)
│   ├── package.json
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── app/             ← Next.js App Router pages + API routes
│   │   ├── lib/
│   │   │   ├── db.ts        ← Prisma client
│   │   │   ├── llm/         ← swappable LLM layer (§7)
│   │   │   ├── engines/     ← wrappers for gitleaks/semgrep/osv
│   │   │   └── scan/        ← orchestrates a scan end-to-end
│   │   └── components/      ← React UI components
│   ├── .env.example         ← documents required env vars (no secrets)
│   └── .gitignore
```

---

## 6. Data model (Prisma schema)

Implement this in `prisma/schema.prisma`. Use SQLite provider for dev.

```prisma
model User {
  id            String   @id @default(cuid())
  githubId      String   @unique
  username      String
  email         String?
  accessToken   String   // GitHub OAuth token (encrypt at rest if feasible; at minimum keep out of logs)
  createdAt     DateTime @default(now())
  scans         Scan[]
}

model Scan {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  repoFullName String   // e.g. "octocat/hello-world"
  repoUrl     String
  status      String    @default("queued") // queued | running | done | failed
  score       Int?      // 0-100 overall safety score, computed from findings
  error       String?
  createdAt   DateTime  @default(now())
  finishedAt  DateTime?
  findings    Finding[]
}

model Finding {
  id           String  @id @default(cuid())
  scanId       String
  scan         Scan    @relation(fields: [scanId], references: [id])
  engine       String  // gitleaks | semgrep | osv
  ruleId       String
  severity     String  // critical | high | medium | low  (normalized)
  priority     String  // "fix_now" | "should_fix" | "minor"  (LLM-assigned)
  title        String  // short, plain-language title
  filePath     String?
  line         Int?
  rawMessage   String  // engine's original message
  plainExplanation String? // LLM: what it means, for a non-expert
  suggestedFix     String? // LLM: how to fix it (snippet or steps)
  redacted     Boolean @default(false) // true if we scrubbed a secret value
  createdAt    DateTime @default(now())
}
```

---

## 7. The LLM layer (free + swappable) — build this carefully

The LLM is the product's "friendly translator." It must be **free** and **swappable** so the model is a config value, not hardcoded.

### 7.1 Interface
Create `src/lib/llm/index.ts` exposing:

```ts
export interface LlmClient {
  // Turn a raw engine finding into plain language + a fix suggestion.
  explainFinding(input: {
    engine: string;
    ruleId: string;
    rawMessage: string;
    codeSnippet?: string; // minimal context only, secrets already redacted
  }): Promise<{ title: string; plainExplanation: string; suggestedFix: string; priority: "fix_now" | "should_fix" | "minor" }>;
}
```

### 7.2 Providers (all free — pick via `LLM_PROVIDER` env var)
Implement at least two, selected by env var so switching is trivial:

1. **Groq** (`LLM_PROVIDER=groq`) — free API, OpenAI-compatible endpoint, very fast. Uses `GROQ_API_KEY` (free to obtain, no card). Model e.g. `llama-3.3-70b-versatile`.
2. **Gemini** (`LLM_PROVIDER=gemini`) — Google AI Studio free tier. Uses `GEMINI_API_KEY` (free). Model e.g. `gemini-2.0-flash`.
3. **Ollama** (`LLM_PROVIDER=ollama`) — fully local, zero API cost, private. Talks to `http://localhost:11434`. Model e.g. `llama3.1`. Requires the user to install Ollama; document it.

All three speak an OpenAI-compatible or simple JSON HTTP API — use a single fetch-based client and just vary base URL / auth / model. Default `LLM_PROVIDER=groq` in `.env.example`, with clear comments on how to switch.

### 7.3 Safety rules for the LLM layer
- **Redact secrets before sending anything to the LLM.** If gitleaks finds a key, never include the actual key value in the prompt — replace with `<REDACTED_SECRET>`.
- Send **only the minimal snippet** (a few lines around the finding), never whole files.
- If no LLM is configured/reachable, the app must still work — fall back to showing the raw engine message with a note "AI explanation unavailable." Never crash a scan because the LLM failed.
- Prompt the model to return **strict JSON** matching the interface; validate and gracefully handle malformed responses.

---

## 8. The scan pipeline (core logic)

Implement in `src/lib/scan/runScan.ts`. Given a `scanId` + repo + user token:

1. **Mark scan `running`.**
2. **Shallow-clone** the repo into a fresh temp dir (`git clone --depth 1`), authenticated with the user's GitHub token. Use a unique temp dir per scan.
3. **Run engines** (as child processes, capture JSON output). Run them with resource/time limits so a huge repo can't hang forever (e.g. a timeout per engine):
   - `gitleaks detect --report-format json`
   - `semgrep --config auto --json` (or a curated ruleset for speed)
   - `osv-scanner --format json` (against lockfiles)
4. **Normalize** every engine's output into the `Finding` shape (§6). Map each engine's severity to `critical|high|medium|low`.
5. **Redact secrets** in any finding before storage or LLM use.
6. **LLM pass** — for each finding (batch/limit for cost & speed), call `explainFinding` to get plain title, explanation, fix, and priority. Use the free model. If it fails, store the raw message and continue.
7. **Compute a score** (0–100): start at 100, subtract weighted penalties per finding by severity (e.g. critical −25, high −12, medium −5, low −1, floor at 0). Store on the scan.
8. **Persist** findings + score, mark scan `done`, set `finishedAt`.
9. **Delete the cloned repo** from disk. Always clean up, even on failure (use try/finally).
10. On any fatal error: mark scan `failed`, store a friendly `error`, clean up.

**Kick-off model (MVP):** the `/api/scan` route creates the Scan row (status `queued`), triggers `runScan` (fire-and-forget async or a simple in-process worker loop), and returns immediately. The UI polls `/api/scan/:id` for status.

---

## 9. UI / pages

Keep it clean and friendly (Tailwind). Minimum pages:

1. **`/` (landing)** — one-line pitch, "Sign in with GitHub" button. Explain in plain words what it does and that it only reads code, never attacks anything.
2. **`/dashboard`** — after login: list the user's GitHub repos (fetched via GitHub API using their token). Each has a "Scan" button. Show past scans with their score badge.
3. **`/scan/[id]`** — the report:
   - Overall **safety score** (big, color-coded).
   - Findings grouped by priority: 🔴 **Fix now** / 🟠 **Should fix** / 🟡 **Minor**.
   - Each finding card: plain-language title, explanation, file:line, and a **"How to fix"** section with the suggested snippet (copy button).
   - While `status = running`, show a friendly progress state and poll.
4. **Empty/error states** — friendly messages if engines aren't installed, LLM unavailable, or repo empty.

**Tone of all UI copy:** encouraging and non-jargony. Assume the reader doesn't know what "CORS" or "CVE" means — explain it.

---

## 10. Build plan — phases with acceptance checks

> Do these in order. Run the Acceptance Check at the end of each before moving on. Commit after each.

### Phase 0 — Scaffold
- Create the Next.js app in `shipsafe/` (TypeScript, App Router, Tailwind).
- Init git, add `.gitignore` (node_modules, .env, tmp/clones, *.db).
- Create `.env.example` documenting every env var (no real secrets).
- Set up Prisma + SQLite, run the initial migration with the §6 schema.
- **Acceptance:** `npm run dev` serves a landing page at localhost; `npx prisma studio` opens and shows empty tables.

### Phase 1 — Engine wrappers (the heart, build before UI)
- Create `src/lib/engines/` with a wrapper per engine (gitleaks, semgrep, osv-scanner) that: runs the CLI on a given directory, parses JSON output, returns normalized findings.
- Each wrapper detects if the binary is missing and returns a clear "not installed" signal instead of crashing.
- Write a small script `scripts/test-scan.ts` that clones a **known-vulnerable public repo** (or a local fixture folder with a fake leaked key + a vulnerable dependency) and prints normalized findings.
- **Acceptance:** running the test script against a fixture with a planted fake secret and a vulnerable dependency prints normalized findings from at least gitleaks and osv-scanner. (Create the fixture yourself — e.g. a folder with a file containing `AKIA...`-style fake key and a `package.json` with an old vulnerable version.)

### Phase 2 — LLM layer
- Implement `src/lib/llm/` per §7 with Groq + Ollama providers and the `explainFinding` interface.
- Implement secret redaction util (used before any LLM call or storage).
- **Acceptance:** a script feeds one raw finding through `explainFinding` and gets back valid JSON (plain title, explanation, fix, priority) using the free provider. With the LLM disabled, it falls back gracefully.

### Phase 3 — Scan pipeline
- Implement `src/lib/scan/runScan.ts` (§8), wiring engines + redaction + LLM + scoring + DB persistence + cleanup.
- **Acceptance:** calling `runScan` on a fixture/repo populates a `Scan` + `Finding` rows in SQLite, computes a score, and deletes the clone dir afterward. Verify in Prisma Studio.

### Phase 4 — Auth
- Add Auth.js with GitHub OAuth. On login, upsert the `User` with their GitHub token.
- Add a repo-list API route that calls the GitHub API with the user's token.
- **Acceptance:** you can sign in with GitHub locally and see your real repos listed. (Document creating a free GitHub OAuth app in README; the user will supply `GITHUB_CLIENT_ID/SECRET`.)

### Phase 5 — API + wiring
- `/api/scan` (POST): create scan, kick off `runScan`, return id.
- `/api/scan/[id]` (GET): return scan status + findings.
- Handle the queued→running→done polling contract.
- **Acceptance:** hitting the scan API for one of your repos runs a real end-to-end scan and the API returns findings JSON.

### Phase 6 — UI
- Build landing, dashboard (repo list + scan button + past scans), and the report page (§9) with the score, grouped findings, and copy-able fixes.
- Friendly loading/empty/error states.
- **Acceptance:** full manual flow in the browser — sign in → pick a repo → scan → watch progress → read a plain-language report with fixes. Take/describe a screenshot in PROGRESS.md.

### Phase 7 — Polish & docs
- Detect missing engine binaries and show setup guidance in the UI.
- Redaction verified (no secret values ever rendered or logged).
- Write `shipsafe/README.md`: prerequisites (Node, git, gitleaks, semgrep, osv-scanner, optional Ollama), env setup, GitHub OAuth app setup, `npm install`, `npx prisma migrate dev`, `npm run dev`, and how to switch LLM providers.
- **Acceptance:** a fresh reader can follow README from zero to a working local app. Final Verification (§12) passes.

---

## 11. Security & safety requirements (for the product itself)

The tool handles other people's code — it must be trustworthy:

- **Never log or display secret values.** Redact to `<REDACTED>` everywhere (DB, logs, UI, LLM prompts).
- **Delete cloned code** after every scan (try/finally). Don't retain source beyond the scan.
- **Minimal LLM exposure:** only send small redacted snippets, never whole files or the whole repo.
- **Token handling:** keep the GitHub token out of logs and client-side code. Server-side only.
- **Timeouts & limits** on engine runs and clone size to prevent hangs/abuse.
- **No live-system features.** Static code only. (Reaffirmed: do not add scanning of URLs/hosts.)
- **`.env` is gitignored**; only `.env.example` (no secrets) is committed.

---

## 12. Final Verification (run before declaring done)

1. `cd shipsafe && npm install` succeeds on a clean checkout.
2. `npx prisma migrate dev` creates the SQLite DB.
3. `npm run dev` starts with no errors.
4. Sign in with GitHub works.
5. Scanning a real (or fixture) repo produces: a score, at least one finding, a plain-language explanation, and a fix suggestion.
6. The cloned repo directory is gone after the scan (no leftover code on disk).
7. No secret value appears anywhere in the UI, DB, or logs (grep the DB/logs for the planted fixture key — it must be redacted).
8. Switching `LLM_PROVIDER` between `groq` and `ollama` works without code changes.
9. `README.md` lets a new person run it from scratch.
10. Total cost to run everything: **$0**. Confirm no paid service was introduced.

When all 10 pass, append a final `- [x] DONE — MVP complete and verified` line to `PROGRESS.md` and summarize what was built in the README.

---

## 13. Stretch goals (only after MVP is verified — do NOT start these first)

- Overall trend / re-scan history per repo.
- "Open a fix as a GitHub PR" button (uses the user's token to create a branch + PR with the suggested diff).
- Shareable safety badge.
- More engines (e.g. `trivy` for IaC/containers — note: check license; trivy is Apache-2.0 and free).
- Webhook: auto-scan on every push.
- Free-tier cloud deploy (Vercel + Neon free Postgres).

---

## 14. Guiding principles (keep these in mind throughout)

1. **Free forever.** If something needs a card, find the free path or leave it as a documented stretch goal.
2. **Plain language wins.** The whole point is explaining security to non-experts. Every finding must be understandable by someone who has never heard of "SQL injection."
3. **Detection = engines, explanation/fixes = LLM.** Never let the LLM invent findings. It only explains and suggests fixes for what the engines actually found.
4. **Ship small, verify, expand.** A working tiny thing beats a broken big thing.
5. **Be trustworthy with user code.** Redact, clean up, minimize exposure.

**Begin with Phase 0. Build the whole thing. Verify. Done.**
