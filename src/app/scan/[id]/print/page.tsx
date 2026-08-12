import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { LocalTime } from "@/components/LocalTime";
import { PrintButton } from "@/components/PrintButton";
import { byPriorityThenSeverity } from "@/lib/scan/ordering";
import {
  PRIORITY_META,
  PRIORITY_SORT,
  SEVERITY_META,
  isPriority,
  isSeverity,
  scoreMeta,
  severityLabel,
} from "@/lib/ui";

// A clean, static, print-optimized view of a scan report — everything expanded,
// no interactive controls — so the user can print it or Save as PDF to share.

export default async function ScanReportPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/dashboard");

  const scan = await db.scan.findUnique({
    where: { id },
    include: { findings: true },
  });
  if (!scan || scan.userId !== session.user.id) notFound();
  if (scan.status !== "done") redirect(`/scan/${id}`);

  // Active findings only — dismissed ones aren't part of the shared posture.
  const findings = scan.findings
    .filter((f) => !f.dismissed)
    .sort(byPriorityThenSeverity);

  const score = scan.score ?? 0;
  const meta = scoreMeta(score);

  const byPriority = PRIORITY_SORT.map((p) => ({
    priority: p,
    items: findings.filter((f) => isPriority(f.priority) && f.priority === p),
  })).filter((g) => g.items.length > 0);

  return (
    <main className="animate-in mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10 print:py-4">
      {/* Screen-only toolbar */}
      <div className="flex items-center justify-between gap-4 print:hidden">
        <Link
          href={`/scan/${id}`}
          className="text-sm text-muted transition-colors hover:text-foreground"
        >
          ← Back to report
        </Link>
        <PrintButton />
      </div>

      {/* Header */}
      <header className="flex flex-col gap-1 border-b border-line pb-6">
        <p className="text-sm text-muted">Safeship security report</p>
        <h1 className="break-all text-2xl font-semibold tracking-tight">{scan.repoFullName}</h1>
        <p className="text-sm text-muted">
          Scanned <LocalTime iso={scan.createdAt.toISOString()} />
        </p>
      </header>

      {/* Score + summary */}
      <section className="flex items-center gap-6">
        <div className={`text-5xl font-semibold tabular-nums ${meta.text}`}>
          {score}
          <span className="text-xl text-muted">/100</span>
        </div>
        <div>
          <p className={`text-lg font-semibold ${meta.text}`}>{meta.label}</p>
          <p className="mt-0.5 text-sm text-muted">
            {findings.length === 0
              ? "No active findings."
              : `${findings.length} finding${findings.length === 1 ? "" : "s"} worth attention.`}
          </p>
        </div>
      </section>

      {/* Findings, grouped by priority */}
      {byPriority.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-sm text-muted">
          No active findings — nothing to report. Nice work.
        </p>
      ) : (
        byPriority.map((group) => {
          const pm = PRIORITY_META[group.priority];
          return (
            <section key={group.priority} className="flex flex-col gap-3">
              <h2 className={`flex items-center gap-2 text-lg font-semibold ${pm.text}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${pm.dot}`} aria-hidden />
                {pm.label}
                <span className="text-sm font-normal text-muted">({group.items.length})</span>
              </h2>
              <ul className="flex flex-col gap-3">
                {group.items.map((f) => (
                  <li
                    key={f.id}
                    className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 shadow-sm print:break-inside-avoid print:shadow-none"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{f.title}</p>
                      {isSeverity(f.severity) && (
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${SEVERITY_META[f.severity].pill}`}
                        >
                          {severityLabel(f.severity)}
                        </span>
                      )}
                    </div>
                    {f.filePath && (
                      <p className="break-all text-xs text-muted">
                        {f.filePath}
                        {f.line ? `:${f.line}` : ""} · {f.engine} · {f.ruleId}
                      </p>
                    )}
                    {f.plainExplanation && (
                      <p className="text-sm text-foreground/90">{f.plainExplanation}</p>
                    )}
                    {f.suggestedFix && (
                      <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                          Suggested fix
                        </p>
                        <p className="whitespace-pre-wrap text-foreground/90">{f.suggestedFix}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      <footer className="border-t border-line pt-4 text-xs text-muted">
        Generated by Safeship · {scan.repoFullName}
      </footer>
    </main>
  );
}
