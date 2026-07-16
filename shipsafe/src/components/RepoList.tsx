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
    return <p className="text-sm text-zinc-500">No repositories found on your account.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter repositories…"
        className="w-full rounded-lg border border-black/[.12] dark:border-white/[.15] bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
      />
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      <ul className="flex flex-col divide-y divide-black/[.06] dark:divide-white/[.08] rounded-xl border border-black/[.08] dark:border-white/[.1] max-h-[26rem] overflow-y-auto">
        {filtered.map((repo) => (
          <li
            key={repo.id}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-medium truncate flex items-center gap-2">
                {repo.fullName}
                {repo.private && (
                  <span className="text-[10px] uppercase tracking-wide rounded bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 text-zinc-600 dark:text-zinc-400">
                    private
                  </span>
                )}
              </p>
              <p className="text-xs text-zinc-500">
                {repo.language ?? "—"}
                {repo.updatedAt &&
                  ` · updated ${new Date(repo.updatedAt).toLocaleDateString()}`}
              </p>
            </div>
            <button
              onClick={() => startScan(repo)}
              disabled={startingId !== null}
              className="shrink-0 rounded-full bg-foreground text-background text-sm font-medium px-4 py-1.5 transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {startingId === repo.id ? "Starting…" : "Scan"}
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-3 text-sm text-zinc-500">No matches.</li>
        )}
      </ul>
    </div>
  );
}
