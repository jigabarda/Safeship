"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Repo } from "@/lib/github/repos";
import { scoreMeta } from "@/lib/ui";
import type { RepoScoreSummary } from "@/lib/scan/history";

export type { Repo };

export function RepoList({
  repos,
  scores = {},
  watched = [],
}: {
  repos: Repo[];
  /** Latest score + delta per repo (by fullName), for the posture badge. */
  scores?: Record<string, RepoScoreSummary>;
  /** Repo full names the user has on their auto-rescan watch list. */
  watched?: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [startingId, setStartingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchedSet, setWatchedSet] = useState<Set<string>>(() => new Set(watched));
  const [watchBusy, setWatchBusy] = useState<string | null>(null);

  async function toggleWatch(repo: Repo) {
    const isWatched = watchedSet.has(repo.fullName);
    // Optimistic update; revert on failure.
    setWatchedSet((prev) => {
      const next = new Set(prev);
      if (isWatched) next.delete(repo.fullName);
      else next.add(repo.fullName);
      return next;
    });
    setWatchBusy(repo.fullName);
    try {
      const res = await fetch("/api/watch", {
        method: isWatched ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoFullName: repo.fullName, repoUrl: repo.url }),
      });
      if (!res.ok) throw new Error("watch toggle failed");
    } catch {
      setWatchedSet((prev) => {
        const next = new Set(prev);
        if (isWatched) next.add(repo.fullName);
        else next.delete(repo.fullName);
        return next;
      });
    } finally {
      setWatchBusy(null);
    }
  }

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
      <ul className="flex max-h-[calc(100vh-13rem)] min-h-[20rem] flex-col divide-y divide-line overflow-y-auto rounded-xl border border-line bg-surface shadow-sm">
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
                {scores[repo.fullName] && <ScoreBadge summary={scores[repo.fullName]} />}
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
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => toggleWatch(repo)}
                disabled={watchBusy === repo.fullName}
                aria-pressed={watchedSet.has(repo.fullName)}
                title={
                  watchedSet.has(repo.fullName)
                    ? "Watching — auto-rescans on a schedule. Click to stop."
                    : "Watch — auto-rescan this repo on a schedule."
                }
                className={`rounded-full p-1.5 transition-colors disabled:opacity-50 ${
                  watchedSet.has(repo.fullName)
                    ? "text-brand"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden fill="none">
                  <path
                    d="M12 3a5 5 0 015 5c0 4 1.5 5.5 2.5 6.5H4.5C5.5 13.5 7 12 7 8a5 5 0 015-5z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                    fill={watchedSet.has(repo.fullName) ? "currentColor" : "none"}
                  />
                  <path
                    d="M10 18a2 2 0 004 0"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <button
                onClick={() => startScan(repo)}
                disabled={startingId !== null}
                className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              >
                {startingId === repo.id ? "Starting…" : "Scan"}
              </button>
            </div>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">No matches.</li>
        )}
      </ul>
    </div>
  );
}

/** Latest safety score for a repo, with a small arrow showing the change. */
function ScoreBadge({ summary }: { summary: RepoScoreSummary }) {
  const { score, delta } = summary;
  return (
    <span
      title={
        delta === null
          ? "Latest safety score"
          : `Latest safety score (${delta >= 0 ? "+" : ""}${delta} since the previous scan)`
      }
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-line ${scoreMeta(score).text}`}
    >
      {score}
      {delta !== null && delta !== 0 && (
        <span aria-hidden className={delta > 0 ? "text-emerald-500" : "text-rose-500"}>
          {delta > 0 ? "▲" : "▼"}
        </span>
      )}
    </span>
  );
}
