"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  isPriority,
  PRIORITY_META,
  PRIORITY_SORT,
  scoreMeta,
  severityLabel,
  type Priority,
} from "@/lib/ui";

export interface FindingData {
  id: string;
  engine: string;
  ruleId: string;
  severity: string;
  priority: string;
  title: string;
  filePath: string | null;
  line: number | null;
  rawMessage: string;
  plainExplanation: string | null;
  suggestedFix: string | null;
  redacted: boolean;
}

export interface ScanData {
  id: string;
  repoFullName: string;
  status: string;
  score: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  findings: FindingData[];
}

export function ScanReport({ scanId, initial }: { scanId: string; initial: ScanData }) {
  const [data, setData] = useState<ScanData>(initial);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const inProgress = data.status === "queued" || data.status === "running";

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/scan/${scanId}`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* transient — keep polling */
    }
  }, [scanId]);

  useEffect(() => {
    if (!inProgress) {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    timer.current = setInterval(poll, 2500);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [inProgress, poll]);

  return (
    <main className="flex flex-1 flex-col w-full max-w-3xl mx-auto px-6 py-10 gap-8">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-zinc-500 hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1 break-all">
            {data.repoFullName}
          </h1>
        </div>
      </header>

      {inProgress && <RunningBanner status={data.status} />}
      {data.status === "failed" && <FailedBanner error={data.error} />}
      {data.status === "done" && <Report data={data} />}
    </main>
  );
}

function RunningBanner({ status }: { status: string }) {
  return (
    <div className="rounded-xl border border-black/[.08] dark:border-white/[.1] p-6 flex items-center gap-4">
      <span className="h-5 w-5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      <div>
        <p className="font-medium">
          {status === "queued" ? "Queued…" : "Scanning your code…"}
        </p>
        <p className="text-sm text-zinc-500">
          Cloning the repo and running the security engines. This can take a
          minute — the page updates itself.
        </p>
      </div>
    </div>
  );
}

function FailedBanner({ error }: { error: string | null }) {
  return (
    <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-6">
      <p className="font-medium text-red-700 dark:text-red-300">Scan failed</p>
      <p className="text-sm text-red-700/80 dark:text-red-300/80 mt-1">
        {error ?? "Something went wrong. Please try again."}
      </p>
      <Link href="/dashboard" className="text-sm underline mt-3 inline-block">
        Back to dashboard
      </Link>
    </div>
  );
}

function Report({ data }: { data: ScanData }) {
  const score = data.score ?? 0;
  const meta = scoreMeta(score);

  const groups = PRIORITY_SORT.map((p) => ({
    priority: p,
    findings: data.findings.filter((f) => f.priority === p),
  }));
  const total = data.findings.length;

  return (
    <>
      <div className="flex flex-col sm:flex-row items-center gap-6 rounded-2xl border border-black/[.08] dark:border-white/[.1] p-6">
        <div
          className={`flex flex-col items-center justify-center h-28 w-28 rounded-full ring-4 ${meta.ring} shrink-0`}
        >
          <span className={`text-3xl font-bold tabular-nums ${meta.text}`}>{score}</span>
          <span className="text-xs text-zinc-500">/ 100</span>
        </div>
        <div className="text-center sm:text-left">
          <p className={`text-lg font-semibold ${meta.text}`}>{meta.label}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            {total === 0
              ? "We didn't find any issues. Nice work!"
              : `We found ${total} thing${total === 1 ? "" : "s"} worth looking at, sorted by how much they matter.`}
          </p>
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-6 text-center">
          <p className="text-2xl">✅</p>
          <p className="font-medium mt-2">No leaked secrets or known-vulnerable dependencies found.</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            This checks code patterns and dependencies — keep reviewing changes as your project grows.
          </p>
        </div>
      ) : (
        groups
          .filter((g) => g.findings.length > 0)
          .map((g) => (
            <section key={g.priority} className="flex flex-col gap-3">
              <PriorityHeader priority={g.priority} count={g.findings.length} />
              {g.findings.map((f) => (
                <FindingCard key={f.id} finding={f} />
              ))}
            </section>
          ))
      )}
    </>
  );
}

function PriorityHeader({ priority, count }: { priority: Priority; count: number }) {
  const meta = PRIORITY_META[priority];
  return (
    <div className="flex items-baseline gap-2 pt-2">
      <h2 className={`text-lg font-semibold ${meta.accent}`}>
        {meta.emoji} {meta.label}
      </h2>
      <span className="text-sm text-zinc-500">
        {count} · {meta.blurb}
      </span>
    </div>
  );
}

function FindingCard({ finding }: { finding: FindingData }) {
  const priority = isPriority(finding.priority) ? finding.priority : "minor";
  const meta = PRIORITY_META[priority];
  return (
    <article className="rounded-xl border border-black/[.08] dark:border-white/[.1] p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold leading-snug">{finding.title}</h3>
        <span className={`shrink-0 text-xs font-medium ${meta.accent}`}>
          {severityLabel(finding.severity)}
        </span>
      </div>

      <p className="text-xs text-zinc-500 font-mono break-all">
        {finding.filePath ? (
          <>
            {finding.filePath}
            {finding.line ? `:${finding.line}` : ""}
          </>
        ) : (
          finding.engine
        )}
        {" · "}
        {finding.engine} · {finding.ruleId}
      </p>

      {finding.plainExplanation && (
        <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
          {finding.plainExplanation}
        </p>
      )}

      {finding.suggestedFix && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              How to fix
            </span>
            <CopyButton text={finding.suggestedFix} />
          </div>
          <pre className="text-sm bg-zinc-100 dark:bg-zinc-900 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
            {finding.suggestedFix}
          </pre>
        </div>
      )}
    </article>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}
