# MIGRATION_PLAN.md — Safeship: serverless-friendly, $0, no-credit-card deploy

> **Status:** ✅ IMPLEMENTED & DEPLOYED. All phases (A–F) landed on `main` and the app
> runs on Vercel + GitHub Actions + Supabase + Groq. This doc is kept as the design record;
> see `README.md` for the current setup/deploy guide.
> **Revert net:** see `revert/REVERT_PLAN.md` (a full snapshot of the pre-migration
> working state was captured before this plan was written).

---

## 1. Goal & hard constraints

Make Safeship **usable by other people on the public internet**, subject to
constraints the user has fixed:

| Constraint | Rule |
|---|---|
| **Cost** | $0. No paid tiers. |
| **Credit card** | None. No host that requires a card to sign up. |
| **Always-on device** | The user's own PC must **not** have to stay on. |
| **Functionality** | Keep the **whole** product — all three engines (**gitleaks, osv-scanner, semgrep**) and the same report experience. |

### Why the current design can't ship to Vercel (the problem)
Safeship's scan (`src/lib/scan/runScan.ts`) must: run **CLI binaries** (`execFile`),
**clone the repo to disk**, and run for **minutes** as a fire-and-forget background
job. Serverless (Vercel) forbids all three: no external binaries, ephemeral/no disk,
and functions are frozen the instant they return a response. So the scan **cannot
run on Vercel**, by design of serverless — not a bug we can configure away.

### The solution in one line
**Split the app in two:** the light half (UI/login/results) runs on **Vercel free**;
the heavy half (the scan) runs on **GitHub Actions** — a free, on-demand Linux
machine that GitHub turns on only when a scan runs, then destroys. Nothing of the
user's stays on; no host needs a credit card.

---

## 2. Target architecture

```
  ┌─────────── VERCEL free (front counter) ──────────┐        ┌──── GITHUB ACTIONS (kitchen, on-demand) ────┐
  │                                                   │        │                                             │
  │ POST /api/scan                                    │        │  .github/workflows/scan.yml                 │
  │   • create Scan row (queued) in Supabase          │        │   1. install gitleaks / osv / semgrep       │
  │   • DISPATCH workflow ────────────────────────────────────►│   2. git clone target repo (shallow)        │
  │   • return scanId                                 │        │   3. run engines (reuses src/lib/engines/*) │
  │                                                   │        │   4. redactText() — strip secrets           │
  │ POST /api/scan/callback  ◄────────────────────────────────│   5. POST redacted findings to callback     │
  │   • verify shared secret                          │        │   6. runner destroyed → clone gone (free)   │
  │   • persist findings, computeScore, mark done     │        │                                             │
  │                                                   │        └─────────────────────────────────────────────┘
  │ GET /api/scan/[id]  (unchanged — UI polls)        │
  │ Groq explains each finding lazily, on open        │
  └───────────────────────────────────────────────────┘
              │
              ▼
      Supabase (Postgres, free)     Groq (LLM, free)     GitHub OAuth (free)
```

### The full $0 / no-card stack

| Piece | Service | Free? | Card? |
|---|---|---|---|
| UI / login / results | **Vercel Hobby** (`*.vercel.app`) | ✅ | ❌ |
| Scan execution (binaries) | **GitHub Actions** | ✅ (public unlimited; private 2,000 min/mo) | ❌ |
| Database | **Supabase** free | ✅ | ❌ |
| AI explanations | **Groq** free API | ✅ | ❌ |
| Code access | **GitHub API** (user's OAuth token) | ✅ | ❌ |

No custom domain needed — the free `safeship.vercel.app` subdomain is the public URL.

---

## 3. How `runScan.ts` splits

The single rule: **needs binaries/disk/clone → GitHub Actions; light DB/LLM/scoring → Vercel.**

| Current step in `runScan.ts` | Destination | Notes |
|---|---|---|
| Load scan + mark `running` (`:37–46`) | **Vercel** (trigger) | Supabase write |
| `mkdtemp` workdir (`:48`) | **Actions runner** | Runner *is* the temp machine |
| `cloneRepo` (`:55`, `:145`) | **Actions runner** | Needs `git` + disk |
| `runAllEngines` (`:59`) | **Actions runner** | Needs the 3 binaries — the core |
| Redact secrets (`:68–80`) | **Actions runner** ⭐ | Redact *before* results leave the runner |
| LLM explain (`:82–95`) | **Vercel** (lazy) | Groq HTTP, on-demand when a finding is opened |
| Persist findings (`:105`) | **Vercel** (callback) | Runner sends redacted findings; Vercel stores |
| `computeScore` + mark `done` (`:123–128`) | **Vercel** (callback) | |
| `rm workdir` cleanup (`:141`) | **Automatic** | Ephemeral runner destroyed → clone gone |

---

## 4. What is reused / extracted / new / changed

### Reused **unchanged** (why this is not an engine rewrite)
- `src/lib/engines/*` — `runAllEngines`, `gitleaks.ts`, `osv.ts`, `semgrep.ts`, `exec.ts`.
  Already standalone; the workflow just calls them.
- `redactText` (`src/lib/llm/`) — moves into the runner step, same code.
- `computeScore`, the report UI (`ScanReport.tsx`), `GET /api/scan/[id]` — untouched.

### Extracted
- The clone + engines + redact core of `runScan` becomes a **standalone Node script**
  (`scanner/run.ts`) that the workflow executes. Input: `repoUrl` (+ token for private).
  Output: **redacted** normalized findings as JSON on stdout / an artifact.

### New (2 pieces)
1. **`.github/workflows/scan.yml`** — installs engines, checks out, runs `scanner/run.ts`,
   POSTs results to the callback. Triggered by `workflow_dispatch` / `repository_dispatch`.
2. **`POST /api/scan/callback`** (Vercel) — authenticated endpoint that receives findings
   and persists them + score + status (the DB half of old `runScan`).

### Changed (2 pieces)
1. **`src/app/api/scan/route.ts`** — replace `void runScan(id)` with "dispatch the workflow
   via the GitHub API," then return `scanId`.
2. **`src/lib/scan/runScan.ts`** — dissolves: engine half → `scanner/run.ts`; DB half → the callback.

### Supporting changes (DB + LLM move to cloud)
- `prisma/schema.prisma` — provider `sqlite` → `postgresql`, add `directUrl`.
- Fresh Postgres migrations (SQLite ones replaced).
- `package.json` — `postinstall: prisma generate`, `build: prisma generate && next build`.
- `.env` / `.env.example` — Supabase `DATABASE_URL` + `DIRECT_URL`; `LLM_PROVIDER=groq` + `GROQ_API_KEY`;
  GitHub dispatch token; callback shared secret.

---

## 5. Three design decisions to get right

1. **Redact on the runner, not on Vercel.** Secrets are stripped (`redactText`) on the
   ephemeral machine so a raw secret value never travels to Vercel/Supabase. Preserves the
   "secrets never stored or transmitted" guarantee from BUILD.md §11.
2. **Authenticate the callback.** The runner POSTs to a public Vercel URL, so it must sign
   with a shared secret (stored as a GitHub Actions secret + a Vercel env var). Otherwise
   anyone could inject fake findings for a scanId.
3. **Private-repo access.** Public repos need no token. Private repos require passing the
   user's GitHub token into the dispatch payload securely. **MVP: public repos first**,
   add private-repo token handling as a follow-up.

---

## 6. LLM coverage — a bonus fix

Today the LLM pass is capped (`SCAN_LLM_MAX_FINDINGS`, default 40) and slow on local
Ollama, so many findings had no explanation. In the new design, explanations are **lazy**:
the scan returns findings fast, and Groq explains a finding **on demand when the user opens
it**. This removes the cap problem *and* the serverless-timeout problem at once — every
finding gets a full explanation, only when needed.

---

## 7. Phased rollout (each phase independently revertible)

- **Phase A — DB:** SQLite → Supabase (schema, env, migrations, build scripts). App still
  scans locally; only storage moved. Verify login + report render against Postgres.
- **Phase B — Extract scanner:** pull clone+engines+redact into `scanner/run.ts`; have local
  `runScan` call it. No behavior change — pure refactor. Verify a local scan still works.
- **Phase C — Workflow:** add `.github/workflows/scan.yml` that runs `scanner/run.ts` on a
  runner and prints findings. Verify by triggering it manually on a public repo.
- **Phase D — Wire trigger + callback:** `POST /api/scan` dispatches the workflow; add
  `POST /api/scan/callback` to persist results. Verify end-to-end on a public repo.
- **Phase E — Deploy:** Vercel project + env vars; update GitHub OAuth callback to the
  `*.vercel.app` URL; `LLM_PROVIDER=groq`. Verify a real user can sign in and scan.
- **Phase F — Lazy Groq explanations + private-repo support** (follow-ups).

---

## 8. Known limitations / open questions

- **Latency:** ~20–30s extra per scan while GitHub spins up a runner + installs engines
  (mitigate by caching the engine binaries between runs).
- **Private-repo minutes:** 2,000 free min/month on the free GitHub plan (public repos are
  unlimited). Fine for a small user base; note the cap in the UI.
- **Engine install per run:** gitleaks/osv are single-binary downloads (fast); semgrep is a
  `pip install` (slower) — cache it.
- **Who owns the workflow repo?** The `scan.yml` lives in a repo you control; Actions minutes
  for private-repo scans bill to that account's free allowance.
- **Callback reliability:** if the runner fails to POST back, the scan should time out to
  `failed` (add a max-age sweep, since there's no long-lived process watching it).

---

## 9. Revert

Any phase can be undone via `revert/REVERT_PLAN.md`. Update that file's §4 file inventory
as new files are actually added, so the revert list stays exhaustive.
