"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface Repo {
  id: number;
  fullName: string;
  private: boolean;
  url: string;
  updatedAt: string | null;
  language: string | null;
}

export function RepoList({ repos }: { repos: Repo[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [startingId, setStartingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) => r.fullName.toLowerCase().includes(q));
  }, [repos, query]);

  async function startScan(repo: Repo) {
    setError(null);
    setStartingId(repo.id);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoFullName: repo.fullName, repoUrl: repo.url }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const { id } = await res.json();
      router.push(`/scan/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setStartingId(null);
    }
  }

  if (repos.length === 0) {
    return <p className="text-sm text-muted">No repositories found on your account.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        >
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter repositories…"
          className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm shadow-sm outline-none transition-colors placeholder:text-muted focus:border-brand"
        />
      </div>
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}
      <ul className="flex max-h-[26rem] flex-col divide-y divide-line overflow-y-auto rounded-xl border border-line bg-surface shadow-sm">
        {filtered.map((repo) => (
          <li
            key={repo.id}
            className="group flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface-2"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate font-medium">
                {repo.fullName}
                {repo.private && (
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted ring-1 ring-line">
                    private
                  </span>
                )}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                {repo.language && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-brand/70" />
                    {repo.language}
                  </span>
                )}
                {repo.language && repo.updatedAt && <span>·</span>}
                {repo.updatedAt &&
                  `updated ${new Date(repo.updatedAt).toLocaleDateString("en-US", { timeZone: "UTC" })}`}
              </p>
            </div>
            <button
              onClick={() => startScan(repo)}
              disabled={startingId !== null}
              className="shrink-0 rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            >
              {startingId === repo.id ? "Starting…" : "Scan"}
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">No matches.</li>
        )}
      </ul>
    </div>
  );
}
