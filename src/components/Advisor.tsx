"use client";

import { useMemo, useState } from "react";
import type { Repo } from "@/lib/github/repos";
import { Markdown } from "@/components/Markdown";

type Tool = "schema" | "stack" | "optimize";

const TOOLS: Array<{ value: Tool; label: string; blurb: string }> = [
  { value: "schema", label: "Schema review", blurb: "Is the database schema well-designed?" },
  { value: "stack", label: "Tech stack", blurb: "Is the stack a good fit? What would you recommend?" },
  { value: "optimize", label: "Optimization", blurb: "Structural, dependency & performance cleanups." },
];

interface Result {
  tool: Tool;
  repoFullName: string;
  rating: "good" | "fair" | "poor";
  headline: string;
  markdown: string;
  filesConsidered: string[];
  truncated: boolean;
}

const RATING_META: Record<Result["rating"], { label: string; cls: string }> = {
  good: {
    label: "Looking good",
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  fair: {
    label: "Some improvements",
    cls: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300",
  },
  poor: {
    label: "Needs work",
    cls: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300",
  },
};

export function Advisor({ repos }: { repos: Repo[] }) {
  const [query, setQuery] = useState("");
  const [repoFullName, setRepoFullName] = useState<string>(repos[0]?.fullName ?? "");
  const [tool, setTool] = useState<Tool>("schema");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? repos.filter((r) => r.fullName.toLowerCase().includes(q)) : repos;
    return list.slice(0, 50);
  }, [repos, query]);

  async function run() {
    if (!repoFullName || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoFullName, tool }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setResult(data as Result);
    } catch {
      setError("Could not reach the advisor. Check your connection.");
    } finally {
      setRunning(false);
    }
  }

  if (repos.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
        No repositories found on your account.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Repo picker */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Repository</label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter repositories…"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted focus:border-brand"
        />
        <div className="max-h-44 overflow-y-auto rounded-xl border border-line bg-surface">
          {filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => setRepoFullName(r.fullName)}
              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                repoFullName === r.fullName ? "bg-surface-2" : "hover:bg-surface-2/50"
              }`}
            >
              <span className="truncate">{r.fullName}</span>
              {repoFullName === r.fullName && (
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-brand" aria-hidden>
                  <path d="M5 12.5l4 4 10-10.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted">No matches.</p>
          )}
        </div>
      </div>

      {/* Tool picker */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">What should the AI review?</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {TOOLS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTool(t.value)}
              aria-pressed={tool === t.value}
              className={`rounded-xl border p-3 text-left transition-colors ${
                tool === t.value
                  ? "border-brand/50 bg-surface ring-1 ring-brand/30"
                  : "border-line bg-surface hover:bg-surface-2/50"
              }`}
            >
              <p className="text-sm font-semibold">{t.label}</p>
              <p className="mt-0.5 text-xs text-muted">{t.blurb}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={run}
          disabled={running || !repoFullName}
          className="self-start rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          {running ? "Analyzing…" : "Run review"}
        </button>
        <p className="text-xs text-muted">
          To review your code, Safeship sends the relevant files from{" "}
          <span className="font-mono">{repoFullName || "the repo"}</span> to the AI provider.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}

      {running && !result && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-6 text-sm text-muted shadow-sm">
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          Reading the repo and writing a review…
        </div>
      )}

      {result && (
        <article className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${RATING_META[result.rating].cls}`}
            >
              {RATING_META[result.rating].label}
            </span>
            <p className="text-sm font-medium">{result.headline}</p>
          </div>

          <div className="border-t border-line pt-4">
            <Markdown text={result.markdown} />
          </div>

          {result.filesConsidered.length > 0 && (
            <details className="border-t border-line pt-3 text-xs text-muted">
              <summary className="cursor-pointer select-none font-medium">
                Files reviewed ({result.filesConsidered.length})
                {result.truncated && " — large repo, tree was truncated"}
              </summary>
              <ul className="mt-2 flex flex-col gap-0.5 font-mono">
                {result.filesConsidered.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </details>
          )}

          <p className="text-xs italic text-muted">
            This is AI-generated advice from reading your files — not a security scan. Use your
            judgment before acting on it.
          </p>
        </article>
      )}
    </div>
  );
}
