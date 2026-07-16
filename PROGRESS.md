# Safeship — Build Progress

- [x] Phase 0: Next.js 16 app scaffolded in `shipsafe/` (TS, App Router, Tailwind v4)
- [x] Phase 0: Prisma + SQLite schema (User/Scan/Finding) and DB client added
- [x] Phase 0: engines installed — gitleaks 8.30.1, osv-scanner 2.4.0, Ollama 0.32.0 + llama3.2 model
- [x] Phase 1: engine wrappers (gitleaks/osv/semgrep) — test-scan fixture PASS (gitleaks 2, osv 7, semgrep gracefully absent)
- [x] Phase 2: LLM layer (Ollama default + Groq) + redaction — test-llm PASS (redaction, fallback, live Ollama JSON round-trip). Note: local model ~30s/call on CPU; Groq is faster/better when deployed.
- [x] Phase 3: scan pipeline (runScan) — test-pipeline PASS (status=done, score, 9 findings, redaction, clone deleted, no secret in DB). Hardened LLM JSON parser to coerce array/object fields.
- [x] Phase 4: GitHub auth (NextAuth v5) — token stored server-side only; /api/repos route. Providers endpoint verified. (Live sign-in needs user's GitHub OAuth app creds — documented in README.)
- [x] Phase 5: API routes — POST /api/scan (create+kickoff), GET /api/scan/[id] (status+findings). Auth guards return 401. tsc clean.
- [x] Phase 6: UI — landing, dashboard (repo list + search + scan + past scans + engine banner), report page (score, grouped findings, copy fixes, live polling). Production build PASS (8 routes).
- [x] Phase 7: engine-availability banner, README (zero-to-run + OAuth + LLM switch + deploy), redaction re-verified. LLM provider swap verified via env only.
- [x] DONE — MVP complete and verified (build + tsc + all 3 test harnesses green; only the browser sign-in flow needs the user's GitHub OAuth credentials).
- [x] Pushed to GitHub: https://github.com/jigabarda/Safeship (fixture fake-secrets assembled at runtime so GitHub push-protection stays clean).
- [x] Flattened layout: app moved from `shipsafe/` up to repo root; `shipsafe/` folder removed. Build still passes. README/structure updated.

## Notes / decisions
- Stack came out as **Next.js 16.2.10 + React 19 + Tailwind v4** (create-next-app@latest moved past 15). Adjusted conventions accordingly (async route `params`, CSS-based Tailwind config).
- LLM default = **Ollama** (fully local, $0, private) per user choice. Groq kept as swappable cloud fallback for when the app is deployed.
- **semgrep** cannot run natively on Windows (no WSL/Docker on this machine). Building the wrapper anyway; it degrades gracefully and will light up on the Linux deploy. Locally we run **gitleaks + osv-scanner**.
- Deploy target revised: **small always-on VM** (not Vercel) because the app shells out to CLI binaries + clones repos to disk + runs multi-minute jobs, which serverless can't host. Build stays deploy-agnostic.
