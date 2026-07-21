"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  isPriority,
  isSeverity,
  PRIORITY_META,
  PRIORITY_SORT,
  scoreMeta,
  SEVERITY_META,
  SEVERITY_SORT,
  severityLabel,
  type Priority,
  type Severity,
} from "@/lib/ui";
import {
  SCAN_STEP_KEYS,
  SCAN_STEP_META,
  type ScanStepEvent,
  type ScanStepKey,
} from "@/lib/scan/steps";

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
  /** Reported pipeline progress. Absent on older scans, hence optional. */
  steps?: ScanStepEvent[];
  findings: FindingData[];
}

const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Where a finding came from — a dependency (osv) or a file path. Used for grouping. */
function sourceOf(f: FindingData): string {
  if (f.engine === "osv") {
    const m = f.title.match(/^([^:]+):/); // "rack@3.2.4: ..." -> "rack@3.2.4"
    if (m) return m[1].trim();
  }
  return f.filePath ?? f.engine;
}

function locationOf(f: FindingData): string {
  return f.filePath ? `${f.filePath}${f.line ? `:${f.line}` : ""}` : f.engine;
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
    <>
      <main className="animate-in mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <p className="text-sm text-muted">Security report</p>
          <h1 className="mt-1 break-all text-2xl font-semibold tracking-tight">
            {data.repoFullName}
          </h1>
        </div>

        {inProgress && (
          <ScanProgress
            scanId={scanId}
            status={data.status}
            startedAt={data.createdAt}
            steps={data.steps ?? []}
          />
        )}
        {data.status === "cancelled" && <CancelledBanner />}
        {data.status === "failed" && <FailedBanner error={data.error} />}
        {data.status === "done" && <Report data={data} />}
      </main>
    </>
  );
}

/**
 * Live scan progress. The steps shown are REAL: the runner (or the inline local
 * pipeline) reports each stage as it begins, and those events arrive here via
 * polling. Stages a topology skips — e.g. there's no "preparing" step locally,
 * since the engines are already installed — simply show no duration.
 */
function ScanProgress({
  scanId,
  status,
  startedAt,
  steps,
}: {
  scanId: string;
  status: string;
  startedAt: string;
  steps: ScanStepEvent[];
}) {
  // null until mounted, so server and client render identical initial HTML.
  const [now, setNow] = useState<number | null>(null);
  const [stopping, setStopping] = useState(false);

  const stop = useCallback(async () => {
    setStopping(true);
    try {
      await fetch(`/api/scan/${scanId}/cancel`, { method: "POST" });
    } catch {
      // Polling reflects whatever actually happened.
    }
  }, [scanId]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const queued = status === "queued";

  // When each reported stage began.
  const beganAt = new Map<ScanStepKey, number>();
  for (const event of steps) {
    const t = new Date(event.at).getTime();
    if (!Number.isNaN(t)) beganAt.set(event.key, t);
  }

  // The furthest stage actually reported drives the checklist — anything before
  // it counts as complete, even if that stage never reported in.
  const lastReported = steps.length > 0 ? steps[steps.length - 1].key : null;
  const activeIndex = lastReported ? SCAN_STEP_KEYS.indexOf(lastReported) : 0;

  const elapsed =
    now === null
      ? 0
      : Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000));
  // Driven by real reported stages, capped below 100 — the report replacing this
  // component is the only true "finished" signal.
  const percent = Math.min(
    95,
    Math.round(((activeIndex + 0.5) / SCAN_STEP_KEYS.length) * 100),
  );

  /** Seconds a stage took (or is taking). null when it never reported. */
  function durationOf(index: number): number | null {
    const begin = beganAt.get(SCAN_STEP_KEYS[index]);
    if (begin === undefined) return null;
    const nextKey = SCAN_STEP_KEYS[index + 1];
    const end = nextKey ? beganAt.get(nextKey) : undefined;
    if (end !== undefined) return Math.max(0, Math.round((end - begin) / 1000));
    if (index === activeIndex && now !== null) {
      return Math.max(0, Math.round((now - begin) / 1000));
    }
    return null;
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{queued ? "Queued…" : "Scanning your code…"}</p>
          <p className="mt-0.5 text-sm text-muted">
            Usually takes about a minute — this page updates itself.
          </p>
        </div>
        <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
          {formatElapsed(elapsed)}
        </span>
        <button
          type="button"
          onClick={stop}
          disabled={stopping}
          className="shrink-0 rounded-full border border-line px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-foreground disabled:opacity-50"
        >
          {stopping ? "Stopping…" : "Stop scan"}
        </button>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Scan progress"
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="flex flex-col gap-3">
        {SCAN_STEP_KEYS.map((key, i) => {
          const meta = SCAN_STEP_META[key];
          const state: StepState =
            i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
          const seconds = durationOf(i);
          return (
            <li key={key} className="flex items-start gap-3">
              <StepIcon state={state} />
              <div className="min-w-0 flex-1">
                <p
                  className={
                    state === "active"
                      ? "text-sm font-medium text-foreground"
                      : state === "done"
                        ? "text-sm text-foreground/70"
                        : "text-sm text-muted"
                  }
                >
                  {meta.label}
                </p>
                <p className="mt-0.5 text-xs text-muted">{meta.detail}</p>
              </div>
              {seconds !== null && (
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                  {formatDuration(seconds)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Compact stage duration, e.g. "8s" or "1m 3s". */
function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

type StepState = "done" | "active" | "pending";

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
        <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3" aria-hidden>
          <path
            d="M2.5 6.5l2.5 2.5 4.5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
    );
  }
  return <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-line-strong" />;
}

/** Elapsed display: "0:42", "12:05", or "23h 33m" once it runs past an hour. */
function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function CancelledBanner() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <p className="font-medium">Scan stopped</p>
      <p className="mt-1 text-sm text-muted">
        You stopped this scan, so there&apos;s no report for it. You can start a
        fresh scan from the dashboard whenever you&apos;re ready.
      </p>
    </div>
  );
}

function FailedBanner({ error }: { error: string | null }) {
  return (
    <div className="rounded-2xl border border-rose-300/70 bg-rose-50 p-6 dark:border-rose-800/60 dark:bg-rose-950/25">
      <p className="font-medium text-rose-700 dark:text-rose-300">Scan failed</p>
      <p className="mt-1 text-sm text-rose-700/80 dark:text-rose-300/80">
        {error ?? "Something went wrong. Please try again."}
      </p>
      <Link
        href="/dashboard"
        className="mt-3 inline-block text-sm font-medium text-rose-700 underline dark:text-rose-300"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

function ScoreGauge({ score, colorClass }: { score: number; colorClass: string }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className={`relative h-24 w-24 shrink-0 ${colorClass}`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{score}</span>
        <span className="text-[10px] text-muted">/ 100</span>
      </div>
    </div>
  );
}

type GroupBy = "priority" | "source";

function Report({ data }: { data: ScanData }) {
  const score = data.score ?? 0;
  const meta = scoreMeta(score);
  const total = data.findings.length;

  const [query, setQuery] = useState("");
  const [activeSeverities, setActiveSeverities] = useState<Set<Severity>>(new Set());
  const [groupBy, setGroupBy] = useState<GroupBy>("priority");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [explains, setExplains] = useState<
    Record<string, { plainExplanation: string; suggestedFix: string } | { error: true }>
  >({});

  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of data.findings) if (isSeverity(f.severity)) counts[f.severity] += 1;
    return counts;
  }, [data.findings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.findings.filter((f) => {
      if (activeSeverities.size > 0 && !(isSeverity(f.severity) && activeSeverities.has(f.severity)))
        return false;
      if (!q) return true;
      return (
        f.title.toLowerCase().includes(q) ||
        (f.filePath ?? "").toLowerCase().includes(q) ||
        f.ruleId.toLowerCase().includes(q) ||
        f.engine.toLowerCase().includes(q)
      );
    });
  }, [data.findings, query, activeSeverities]);

  const groups = useMemo(() => groupFindings(filtered, groupBy), [filtered, groupBy]);
  const ordered = useMemo(() => groups.flatMap((g) => g.findings), [groups]);

  // Derive the active finding during render (no effect): honor the user's
  // explicit pick when it's still visible, otherwise default to the top one.
  const activeId =
    selectedId && ordered.some((f) => f.id === selectedId)
      ? selectedId
      : (ordered[0]?.id ?? null);
  const selected = ordered.find((f) => f.id === activeId) ?? null;

  // Lazily fetch the AI explanation for the open finding (cached in the DB, so
  // it's generated only once and survives reloads). "Loading" is derived, not
  // stored, so this effect only ever calls setState in an async callback.
  useEffect(() => {
    if (!activeId) return;
    const f = ordered.find((x) => x.id === activeId);
    if (!f || f.plainExplanation || explains[activeId]) return;
    let cancelled = false;
    fetch(`/api/findings/${activeId}/explain`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("explain failed"))))
      .then((d: { plainExplanation: string; suggestedFix: string }) => {
        if (!cancelled) setExplains((prev) => ({ ...prev, [activeId]: d }));
      })
      .catch(() => {
        if (!cancelled) setExplains((prev) => ({ ...prev, [activeId]: { error: true } }));
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, ordered, explains]);

  const withExplanation = (f: FindingData): FindingData => {
    const ov = explains[f.id];
    return ov && !("error" in ov)
      ? { ...f, plainExplanation: ov.plainExplanation, suggestedFix: ov.suggestedFix }
      : f;
  };
  // Derived: a finding is "loading" while unexplained with no result/error yet.
  const isExplaining = (f: FindingData): boolean =>
    !f.plainExplanation && !explains[f.id];

  const toggleSeverity = (s: Severity) =>
    setActiveSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <>
      {/* Overview */}
      <section className="flex flex-col items-center gap-6 rounded-2xl border border-line bg-surface p-6 shadow-sm sm:flex-row">
        <ScoreGauge score={score} colorClass={meta.text} />
        <div className="flex-1 text-center sm:text-left">
          <p className={`text-lg font-semibold ${meta.text}`}>{meta.label}</p>
          <p className="mt-1 text-sm text-muted">
            {total === 0
              ? "We didn't find any issues. Nice work!"
              : `We found ${total} thing${total === 1 ? "" : "s"} worth looking at. Tap a severity to filter.`}
          </p>
          {total > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              {SEVERITY_SORT.filter((s) => severityCounts[s] > 0).map((s) => {
                const active = activeSeverities.has(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleSeverity(s)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${SEVERITY_META[s].pill} ${
                      active ? "ring-2 ring-offset-1 ring-offset-surface" : "hover:opacity-100"
                    } ${activeSeverities.size > 0 && !active ? "opacity-45" : ""}`}
                  >
                    <span className="tabular-nums">{severityCounts[s]}</span>
                    {SEVERITY_META[s].label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {total === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search findings…"
                className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <Segmented
              value={groupBy}
              onChange={setGroupBy}
              options={[
                { value: "priority", label: "Priority" },
                { value: "source", label: "Source" },
              ]}
            />
          </div>

          {ordered.length === 0 ? (
            <p className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-sm text-muted">
              No findings match your filters.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
              {/* LEFT — findings list */}
              <div className="flex flex-col gap-6">
                {groups.map((g) => (
                  <section key={g.key} className="flex flex-col gap-2">
                    {groupBy === "priority" ? (
                      <PriorityHeader priority={g.key as Priority} count={g.findings.length} />
                    ) : (
                      <SourceHeader name={g.key} findings={g.findings} />
                    )}
                    {g.findings.map((f) => (
                      <div key={f.id}>
                        <FindingRow
                          finding={f}
                          selected={activeId === f.id}
                          onSelect={() => setSelectedId(f.id)}
                        />
                        {/* Mobile: inline detail under the selected row */}
                        {activeId === f.id && (
                          <div className="mt-2 lg:hidden">
                            <DetailPanel finding={withExplanation(f)} loading={isExplaining(f)} />
                          </div>
                        )}
                      </div>
                    ))}
                  </section>
                ))}
              </div>

              {/* RIGHT — sticky detail panel (desktop only) */}
              <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
                {selected ? (
                  <DetailPanel finding={withExplanation(selected)} loading={isExplaining(selected)} />
                ) : (
                  <div className="rounded-xl border border-dashed border-line bg-surface/50 p-8 text-center text-sm text-muted">
                    Select a finding to see the full explanation and fix.
                  </div>
                )}
              </aside>
            </div>
          )}
        </>
      )}
    </>
  );
}

interface Group {
  key: string;
  findings: FindingData[];
}

function groupFindings(findings: FindingData[], by: GroupBy): Group[] {
  const bySev = (a: FindingData, b: FindingData) =>
    (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9);

  if (by === "priority") {
    return PRIORITY_SORT.map((p) => ({
      key: p,
      findings: findings.filter((f) => f.priority === p).sort(bySev),
    })).filter((g) => g.findings.length > 0);
  }

  const map = new Map<string, FindingData[]>();
  for (const f of findings) {
    const key = sourceOf(f);
    const arr = map.get(key);
    if (arr) arr.push(f);
    else map.set(key, [f]);
  }
  return [...map.entries()]
    .map(([key, fs]) => ({ key, findings: [...fs].sort(bySev) }))
    .sort((a, b) => {
      const wa = Math.min(...a.findings.map((f) => SEV_RANK[f.severity] ?? 9));
      const wb = Math.min(...b.findings.map((f) => SEV_RANK[f.severity] ?? 9));
      return wa - wb || b.findings.length - a.findings.length;
    });
}

function FindingRow({
  finding,
  selected,
  onSelect,
}: {
  finding: FindingData;
  selected: boolean;
  onSelect: () => void;
}) {
  const priority = isPriority(finding.priority) ? finding.priority : "minor";
  const meta = PRIORITY_META[priority];
  const sev = isSeverity(finding.severity) ? finding.severity : null;

  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative flex w-full items-center gap-3 overflow-hidden rounded-xl border py-3 pl-4 pr-3 text-left shadow-sm transition ${
        selected
          ? "border-brand/50 bg-surface ring-1 ring-brand/30"
          : "border-line bg-surface hover:bg-surface-2/50"
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${meta.bar}`} aria-hidden />
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
          sev ? SEVERITY_META[sev].pill : "bg-surface-2 text-muted ring-line"
        }`}
      >
        {severityLabel(finding.severity)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-semibold leading-snug">{finding.title}</span>
        <span className="mt-0.5 block truncate font-mono text-xs text-muted">{locationOf(finding)}</span>
      </span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={`h-4 w-4 shrink-0 transition-colors ${selected ? "text-brand" : "text-muted"}`}
        aria-hidden
      >
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function DetailPanel({
  finding,
  loading = false,
}: {
  finding: FindingData;
  loading?: boolean;
}) {
  const priority = isPriority(finding.priority) ? finding.priority : "minor";
  const pmeta = PRIORITY_META[priority];
  const sev = isSeverity(finding.severity) ? finding.severity : null;

  return (
    <article className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <span className={`absolute inset-x-0 top-0 h-1 ${pmeta.bar}`} aria-hidden />
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                sev ? SEVERITY_META[sev].pill : "bg-surface-2 text-muted ring-line"
              }`}
            >
              {severityLabel(finding.severity)}
            </span>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${pmeta.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${pmeta.dot}`} />
              {pmeta.label}
            </span>
          </div>
          <h3 className="text-base font-semibold leading-snug">{finding.title}</h3>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {finding.filePath && (
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 font-mono text-foreground/80">
              {locationOf(finding)}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-muted">
            {finding.engine}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 font-mono text-muted">
            {finding.ruleId}
          </span>
          {finding.redacted && (
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-muted">
              secret redacted
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            What it means
          </span>
          {finding.plainExplanation ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
              {finding.plainExplanation}
            </p>
          ) : loading ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              Writing a plain-English explanation…
            </p>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                {finding.rawMessage}
              </p>
              <p className="mt-1 text-xs italic text-muted">
                Showing the security engine&apos;s original message — the AI explanation
                couldn&apos;t be generated.
              </p>
            </>
          )}
        </div>

        {finding.suggestedFix ? (
          <FixBlock text={finding.suggestedFix} />
        ) : loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            Generating a suggested fix…
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted">
            No AI-suggested fix yet. For dependency issues this usually means{" "}
            <span className="font-medium text-foreground/80">upgrading the package</span> to a
            patched version; check the rule ({finding.ruleId}) for the fixed release.
          </p>
        )}
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-emerald-300/70 bg-emerald-50 p-8 text-center dark:border-emerald-800/60 dark:bg-emerald-950/25">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
          <path
            d="M5 12.5l4 4 10-10.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="font-medium">No leaked secrets or known-vulnerable dependencies found.</p>
      <p className="mt-1 text-sm text-muted">
        This checks code patterns and dependencies — keep reviewing changes as your project grows.
      </p>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 p-0.5">
      <span className="px-2 text-xs font-medium text-muted">Group</span>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
            value === o.value
              ? "bg-surface text-foreground shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PriorityHeader({ priority, count }: { priority: Priority; count: number }) {
  const meta = PRIORITY_META[priority];
  return (
    <div className="flex items-center gap-2.5">
      <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
      <h2 className={`text-sm font-semibold ${meta.text}`}>{meta.label}</h2>
      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium tabular-nums text-muted">
        {count}
      </span>
    </div>
  );
}

function SourceHeader({ name, findings }: { name: string; findings: FindingData[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-muted" aria-hidden>
        <path d="M4 7l8-4 8 4v10l-8 4-8-4V7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M4 7l8 4 8-4M12 11v10" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <h2 className="break-all font-mono text-sm font-semibold">{name}</h2>
      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium tabular-nums text-muted">
        {findings.length}
      </span>
    </div>
  );
}

function FixBlock({ text }: { text: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
            <path
              d="M14 3.5l-2.5 4 3 1L9.5 15M10 6.5L4 12l6 5.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Suggested fix
        </span>
        <CopyButton text={text} />
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap p-3 font-mono text-sm leading-relaxed text-foreground/90">
        {text}
      </pre>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-brand"
    >
      {copied ? (
        <>
          <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
            <path
              d="M5 12.5l4 4 10-10.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
            <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M5 15V6a2 2 0 012-2h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}
