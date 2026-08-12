import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { LocalTime } from "@/components/LocalTime";
import { byPriorityThenSeverity } from "@/lib/scan/ordering";
import { diffScans, type ComparableFinding } from "@/lib/scan/compare";
import { SEVERITY_META, isSeverity, scoreMeta, severityLabel } from "@/lib/ui";

export default async function CompareScanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ base?: string }>;
}) {
  const { id } = await params;
  const { base: baseParam } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/dashboard");
  const userId = session.user.id;

  const current = await db.scan.findUnique({
    where: { id },
    include: { findings: true },
  });
  if (!current || current.userId !== userId) notFound();
  // Only a finished scan has a settled set of findings to compare.
  if (current.status !== "done") redirect(`/scan/${id}`);

  // Earlier finished scans of the same repo are the candidate baselines.
  const priorScans = await db.scan.findMany({
    where: {
      userId,
      repoFullName: current.repoFullName,
      status: "done",
      score: { not: null },
      createdAt: { lt: current.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, score: true, createdAt: true },
  });

  return (
    <>
      <AppHeader
        username={session.user.username ?? session.user.name}
        containerClass="max-w-5xl"
      />
      <main className="animate-in mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <Link
            href={`/scan/${id}`}
            className="text-sm text-muted transition-colors hover:text-foreground"
          >
            ← Back to report
          </Link>
          <h1 className="mt-2 break-all text-2xl font-semibold tracking-tight">
            {current.repoFullName}
          </h1>
          <p className="mt-1 text-muted">What changed between two scans.</p>
        </div>

        {priorScans.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface/50 px-4 py-10 text-center text-sm text-muted">
            No earlier scan of this repo to compare against yet. Run another scan
            later and you&apos;ll see what changed.
          </p>
        ) : (
          <ComparisonBody
            currentScanId={id}
            currentScore={current.score}
            currentCreatedAt={current.createdAt}
            currentFindings={current.findings}
            priorScans={priorScans}
            baseParam={baseParam}
          />
        )}
      </main>
    </>
  );
}

async function ComparisonBody({
  currentScanId,
  currentScore,
  currentCreatedAt,
  currentFindings,
  priorScans,
  baseParam,
}: {
  currentScanId: string;
  currentScore: number | null;
  currentCreatedAt: Date;
  currentFindings: ComparableFinding[];
  priorScans: { id: string; score: number | null; createdAt: Date }[];
  baseParam?: string;
}) {
  // Default baseline is the most recent earlier scan; honor ?base= if it's valid.
  const baseMeta =
    priorScans.find((s) => s.id === baseParam) ?? priorScans[0];

  const baseScan = await db.scan.findUnique({
    where: { id: baseMeta.id },
    include: { findings: true },
  });
  if (!baseScan) notFound();

  const diff = diffScans(baseScan.findings, currentFindings);
  const scoreDelta =
    baseScan.score !== null && currentScore !== null
      ? currentScore - baseScan.score
      : null;

  return (
    <>
      {/* Baseline picker */}
      {priorScans.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Compare against:</span>
          {priorScans.map((s) => {
            const active = s.id === baseMeta.id;
            return (
              <Link
                key={s.id}
                href={`/scan/${currentScanId}/compare?base=${s.id}`}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${
                  active
                    ? "bg-foreground text-background ring-transparent"
                    : "bg-surface text-muted ring-line hover:text-foreground"
                }`}
              >
                <LocalTime iso={s.createdAt.toISOString()} withTime={false} /> · {s.score}
              </Link>
            );
          })}
        </div>
      )}

      {/* Score change */}
      <section className="flex items-center justify-center gap-4 rounded-2xl border border-line bg-surface p-6 shadow-sm sm:justify-start">
        <ScorePill score={baseScan.score} />
        <span className="text-2xl text-muted" aria-hidden>
          →
        </span>
        <ScorePill score={currentScore} />
        {scoreDelta !== null && scoreDelta !== 0 && (
          <span
            className={`ml-1 text-sm font-semibold tabular-nums ${
              scoreDelta > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {scoreDelta > 0 ? "▲ +" : "▼ "}
            {scoreDelta}
          </span>
        )}
        <span className="ml-auto hidden text-right text-xs text-muted sm:block">
          <LocalTime iso={baseScan.createdAt.toISOString()} withTime={false} /> →{" "}
          <LocalTime iso={currentCreatedAt.toISOString()} withTime={false} />
        </span>
      </section>

      {/* At-a-glance counts */}
      <section className="grid grid-cols-3 gap-3">
        <CountTile label="Fixed" value={diff.fixed.length} tone="good" />
        <CountTile label="New" value={diff.added.length} tone="bad" />
        <CountTile label="Still present" value={diff.carriedOver} tone="muted" />
      </section>

      <DiffList
        title="Fixed since the baseline"
        emptyText="Nothing from the baseline was resolved."
        tone="good"
        findings={diff.fixed}
      />
      <DiffList
        title="New in this scan"
        emptyText="No new findings were introduced. Nice."
        tone="bad"
        findings={diff.added}
      />
    </>
  );
}

function ScorePill({ score }: { score: number | null }) {
  if (score === null) return <span className="text-2xl font-semibold text-muted">—</span>;
  return (
    <span className={`text-3xl font-semibold tabular-nums ${scoreMeta(score).text}`}>
      {score}
      <span className="text-base text-muted">/100</span>
    </span>
  );
}

function CountTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "bad" | "muted";
}) {
  const color =
    value === 0
      ? "text-foreground"
      : tone === "good"
        ? "text-emerald-600 dark:text-emerald-400"
        : tone === "bad"
          ? "text-rose-600 dark:text-rose-400"
          : "text-foreground";
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

function DiffList({
  title,
  emptyText,
  tone,
  findings,
}: {
  title: string;
  emptyText: string;
  tone: "good" | "bad";
  findings: ComparableFinding[];
}) {
  const sorted = [...findings].sort(byPriorityThenSeverity);
  const accent = tone === "good" ? "bg-emerald-500" : "bg-rose-500";
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <span className={`h-2.5 w-2.5 rounded-full ${accent}`} aria-hidden />
        {title}
        <span className="text-sm font-normal text-muted">({findings.length})</span>
      </h2>
      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-surface/50 px-4 py-6 text-center text-sm text-muted">
          {emptyText}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
          {sorted.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{f.title}</p>
                {f.filePath && (
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {f.filePath}
                    {f.line ? `:${f.line}` : ""}
                  </p>
                )}
              </div>
              {isSeverity(f.severity) && (
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${SEVERITY_META[f.severity].pill}`}
                >
                  {severityLabel(f.severity)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
