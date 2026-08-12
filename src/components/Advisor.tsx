"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Repo } from "@/lib/github/repos";
import type { SchemaModel } from "@/lib/schema/parse";
import type { StructureNode } from "@/lib/advisor/structureTree";
import { Markdown } from "@/components/Markdown";
import { SchemaDiagram } from "@/components/SchemaDiagram";
import { StructureTree } from "@/components/StructureTree";
import { LocalTime } from "@/components/LocalTime";

type Tool = "schema" | "stack" | "optimize" | "structure";
/** Exported for the server page that hydrates recent runs. */
export type AdvisorToolValue = Tool;

/** The visual a tool may carry: a schema ER model or a folder tree. */
type VisualModel = SchemaModel | StructureNode;

export interface RecentRun {
  id: string;
  repoFullName: string;
  tool: Tool;
  rating: "good" | "fair" | "poor";
  headline: string;
  markdown: string;
  model?: VisualModel | null;
  filesConsidered: string[];
  createdAt: string;
}

const TOOLS: Array<{ value: Tool; label: string; blurb: string }> = [
  { value: "schema", label: "Schema review", blurb: "Visualize the tables and get design fixes." },
  { value: "structure", label: "File structure", blurb: "See a clean folder layout, then open a PR." },
  { value: "stack", label: "Tech stack", blurb: "Is the stack a good fit? Recommendations." },
  { value: "optimize", label: "Optimization", blurb: "Structural, dependency & performance cleanups." },
];

/** AI review result. Schema/Structure reviews also carry a visual model. */
interface Result {
  tool: Tool;
  repoFullName: string;
  rating: "good" | "fair" | "poor";
  headline: string;
  markdown: string;
  /** Schema reviews → ER model; Structure reviews → recommended folder tree. */
  model?: VisualModel;
  filesConsidered: string[];
  truncated: boolean;
}

type ApplyState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "done";
      prUrl: string;
      prNumber: number;
      summary: string;
      changeKind: "edit" | "create";
      path: string;
      alreadyOpen: boolean;
    }
  | { status: "skipped"; note: string }
  | { status: "error"; error: string };

const TOOL_LABEL: Record<Tool, string> = {
  schema: "Schema",
  structure: "Structure",
  stack: "Stack",
  optimize: "Optimize",
};

const RATING_DOT: Record<Result["rating"], string> = {
  good: "bg-emerald-500",
  fair: "bg-amber-500",
  poor: "bg-rose-500",
};

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

export function Advisor({ repos, recent: initialRecent = [] }: { repos: Repo[]; recent?: RecentRun[] }) {
  const [query, setQuery] = useState("");
  const [repoFullName, setRepoFullName] = useState<string>(repos[0]?.fullName ?? "");
  const [tool, setTool] = useState<Tool>("schema");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [apply, setApply] = useState<ApplyState>({ status: "idle" });
  const [recent, setRecent] = useState<RecentRun[]>(initialRecent);
  const [repoOpen, setRepoOpen] = useState(false);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const repoRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!repoOpen) return;
    function onDown(e: MouseEvent) {
      if (repoRef.current && !repoRef.current.contains(e.target as Node)) setRepoOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [repoOpen]);

  // Bring the result into view when it appears (new run or opened from history).
  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [result]);

  function openRecent(r: RecentRun) {
    setError(null);
    setApply({ status: "idle" });
    setRepoFullName(r.repoFullName);
    setTool(r.tool);
    setResult({
      tool: r.tool,
      repoFullName: r.repoFullName,
      rating: r.rating,
      headline: r.headline,
      markdown: r.markdown,
      model: r.model ?? undefined,
      filesConsidered: r.filesConsidered,
      truncated: false,
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? repos.filter((r) => r.fullName.toLowerCase().includes(q)) : repos;
    return list.slice(0, 50);
  }, [repos, query]);

  async function runApply() {
    if (!result || apply.status === "loading") return;
    setApply({ status: "loading" });
    const isStructure = result.tool === "structure";
    const endpoint = isStructure ? "/api/advisor/apply-structure" : "/api/advisor/apply-schema";
    const body = isStructure
      ? { repoFullName: result.repoFullName, markdown: result.markdown, tree: result.model }
      : { repoFullName: result.repoFullName, recommendations: result.markdown };
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApply({ status: "error", error: data.error ?? `Request failed (${res.status})` });
        return;
      }
      if (data.applied) {
        setApply({
          status: "done",
          prUrl: data.prUrl,
          prNumber: data.prNumber,
          summary: data.summary ?? "",
          changeKind: data.changeKind,
          path: data.path,
          alreadyOpen: Boolean(data.alreadyOpen),
        });
      } else {
        setApply({ status: "skipped", note: data.note ?? "The AI couldn't apply these automatically." });
      }
    } catch {
      setApply({ status: "error", error: "Could not reach the server." });
    }
  }

  async function run() {
    if (!repoFullName || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setApply({ status: "idle" });
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
      if (data.id) {
        const entry: RecentRun = {
          id: data.id,
          repoFullName: data.repoFullName,
          tool: data.tool,
          rating: data.rating,
          headline: data.headline,
          markdown: data.markdown,
          model: data.model ?? null,
          filesConsidered: data.filesConsidered ?? [],
          createdAt: data.createdAt ?? new Date().toISOString(),
        };
        setRecent((prev) => [entry, ...prev.filter((r) => r.id !== entry.id)].slice(0, 12));
      }
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
    <div
      className={`flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_19rem] ${
        showAllRecent ? "md:items-start" : "md:items-stretch"
      }`}
    >
      {/* New review — top-left */}
      <div className="flex min-w-0 flex-col gap-2 md:col-start-1 md:row-start-1">
          <span className="text-sm font-medium text-muted">New review</span>
          <div className="flex flex-1 flex-col gap-5 rounded-2xl border border-line bg-surface p-5 shadow-sm">
        {/* Repository — searchable dropdown */}
        <div ref={repoRef} className="relative flex flex-col gap-1.5">
          <label className="text-sm font-medium">Repository</label>
          <button
            type="button"
            onClick={() => setRepoOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={repoOpen}
            className="flex items-center justify-between gap-3 rounded-lg border border-line bg-background px-3 py-2 text-left text-sm outline-none transition-colors hover:border-line-strong focus:border-brand"
          >
            <span className={`truncate font-mono ${repoFullName ? "" : "text-muted"}`}>
              {repoFullName || "Select a repository"}
            </span>
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-muted" aria-hidden>
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {repoOpen && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
              <div className="border-b border-line p-2">
                <input
                  type="text"
                  value={query}
                  autoFocus
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter repositories…"
                  className="w-full rounded-md border border-line bg-background px-2.5 py-1.5 text-sm outline-none placeholder:text-muted focus:border-brand"
                />
              </div>
              <ul className="max-h-60 overflow-y-auto py-1">
                {filtered.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => {
                        setRepoFullName(r.fullName);
                        setRepoOpen(false);
                        setQuery("");
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left font-mono text-sm transition-colors ${
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
                  </li>
                ))}
                {filtered.length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-muted">No matches.</p>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Tool picker — even 2×2 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">What should the AI review?</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {TOOLS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTool(t.value)}
                aria-pressed={tool === t.value}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  tool === t.value
                    ? "border-brand/50 bg-brand/5 ring-1 ring-brand/30"
                    : "border-line bg-background hover:bg-surface-2/50"
                }`}
              >
                <p className="text-sm font-semibold">{t.label}</p>
                <p className="mt-0.5 text-xs text-muted">{t.blurb}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Run */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="max-w-md text-xs text-muted">
            Sends the relevant files from{" "}
            <span className="font-mono">{repoFullName || "the repo"}</span> to the AI provider.
          </p>
          <button
            onClick={run}
            disabled={running || !repoFullName}
            className="shrink-0 rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            {running ? "Analyzing…" : "Run review"}
          </button>
        </div>
      </div>
        </div>

        {recent.length > 0 && (
          <div
            className={`flex min-w-0 flex-col gap-2 md:col-start-2 md:row-start-1 ${
              showAllRecent ? "md:row-span-2" : ""
            }`}
          >
            <span className="text-sm font-medium text-muted">Recent reviews</span>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
              <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
                {(showAllRecent ? recent : recent.slice(0, 5)).map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => openRecent(r)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${RATING_DOT[r.rating]}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-mono text-sm">{r.repoFullName}</span>
                          <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                            {TOOL_LABEL[r.tool]}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted">{r.headline}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        <LocalTime iso={r.createdAt} withTime={false} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {recent.length > 5 && (
                <button
                  onClick={() => setShowAllRecent((s) => !s)}
                  className="border-t border-line py-2 text-center text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  {showAllRecent ? "Show less" : `View ${recent.length - 5} more`}
                </button>
              )}
            </div>
          </div>
        )}

        <div
          className={`flex min-w-0 flex-col gap-6 md:row-start-2 ${
            showAllRecent ? "md:col-start-1" : "md:col-span-2"
          }`}
        >
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}

      {running && !result && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-6 text-sm text-muted shadow-sm">
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          {tool === "schema"
            ? "Reading the schema, drawing it, and writing suggestions…"
            : tool === "structure"
              ? "Mapping your files and designing a clean structure…"
              : "Reading the repo and writing a review…"}
        </div>
      )}

      {result && (
        <article
          ref={resultRef}
          className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${RATING_META[result.rating].cls}`}
            >
              {RATING_META[result.rating].label}
            </span>
            <p className="text-sm font-medium">{result.headline}</p>
          </div>

          {result.tool === "schema" &&
            result.model &&
            "tables" in result.model &&
            result.model.tables.length > 0 && (
              <div className="border-t border-line pt-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  Schema overview
                </p>
                <SchemaDiagram model={result.model} />
              </div>
            )}

          {result.tool === "schema" &&
            (!result.model || !("tables" in result.model) || result.model.tables.length === 0) && (
              <p className="border-t border-line pt-4 text-xs text-muted">
                Couldn&apos;t auto-draw a diagram for this schema format — the visualizer currently
                understands Prisma, SQL <span className="font-mono">CREATE TABLE</span>, and Rails{" "}
                <span className="font-mono">schema.rb</span>. The review below is still based on your
                schema files.
              </p>
            )}

          {result.tool === "structure" && result.model && "name" in result.model && (
            <div className="border-t border-line pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                Recommended structure
              </p>
              <StructureTree root={result.model} />
            </div>
          )}

          <div className="border-t border-line pt-4">
            <Markdown text={result.markdown} />
          </div>

          {result.tool === "schema" && (
            <ApplyPanel
              state={apply}
              onApply={runApply}
              actionLabel="Improve schema & open PR"
              description="Safeship applies the safe, high-value fixes above the correct way for your stack — editing the schema file (Prisma/SQL) or adding a migration (Rails) — and opens a pull request you review. Nothing is applied to a database."
            />
          )}

          {result.tool === "structure" && result.model && "name" in result.model && (
            <ApplyPanel
              state={apply}
              onApply={runApply}
              actionLabel="Add STRUCTURE.md & open PR"
              description="Opens a pull request that adds a STRUCTURE.md documenting the recommended layout and migration steps. Safe — it doesn't move or rename any of your files, so nothing in your build can break."
            />
          )}

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
    </div>
  );
}

/**
 * "Apply these fixes" — turns an Advisor recommendation into one reviewable pull
 * request. Reused by the schema and structure tools with tool-specific copy.
 */
function ApplyPanel({
  state,
  onApply,
  actionLabel,
  description,
}: {
  state: ApplyState;
  onApply: () => void;
  actionLabel: string;
  description: string;
}) {
  if (state.status === "done") {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-2/30 p-3">
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
            <path d="M5 12.5l4 4 10-10.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {state.alreadyOpen ? "A pull request is already open" : "Pull request opened"}
        </p>
        <p className="text-xs text-muted">
          {state.changeKind === "create" ? "Added" : "Edited"}{" "}
          <span className="font-mono">{state.path}</span>
          {state.summary ? ` — ${state.summary}` : ""}
        </p>
        <a
          href={state.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
        >
          View pull request #{state.prNumber}
          <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
            <path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
    );
  }

  if (state.status === "skipped") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2/30 p-3">
        <p className="text-xs text-muted">{state.note}</p>
        <button
          onClick={onApply}
          className="w-fit rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
        >
          Try again
        </button>
      </div>
    );
  }

  const loading = state.status === "loading";
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Apply these fixes
        </span>
        <button
          onClick={onApply}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-background border-t-transparent" />
              Opening PR…
            </>
          ) : (
            actionLabel
          )}
        </button>
      </div>
      <p className="text-xs text-muted">{description}</p>
      {state.status === "error" && (
        <p className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {state.error}
        </p>
      )}
    </div>
  );
}
