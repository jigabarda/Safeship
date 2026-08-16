import { LocalTime } from "@/components/LocalTime";
import {
  PRIORITY_META,
  PRIORITY_SORT,
  SEVERITY_META,
  isPriority,
  isSeverity,
  scoreMeta,
  severityLabel,
} from "@/lib/ui";

// A static, non-interactive scan report — shared by the printable/export view
// and the public share link. It renders only SAFE fields (title, severity,
// file path, plain-English explanation, suggested fix); never the engine's raw
// message, which can contain a leaked secret value.

export interface StaticFinding {
  id: string;
  engine: string;
  ruleId: string;
  severity: string;
  priority: string;
  title: string;
  filePath: string | null;
  line: number | null;
  plainExplanation: string | null;
  suggestedFix: string | null;
}

export function StaticScanReport({
  repoFullName,
  score,
  scannedAtIso,
  findings,
}: {
  repoFullName: string;
  score: number | null;
  scannedAtIso: string;
  findings: StaticFinding[];
}) {
  const displayScore = score ?? 0;
  const meta = scoreMeta(displayScore);

  const byPriority = PRIORITY_SORT.map((p) => ({
    priority: p,
    items: findings.filter((f) => isPriority(f.priority) && f.priority === p),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <header className="flex flex-col gap-1 border-b border-line pb-6">
        <p className="text-sm text-muted">Safeship security report</p>
        <h1 className="break-all text-2xl font-semibold tracking-tight">{repoFullName}</h1>
        <p className="text-sm text-muted">
          Scanned <LocalTime iso={scannedAtIso} />
        </p>
      </header>

      <section className="flex items-center gap-6">
        <div className={`text-5xl font-semibold tabular-nums ${meta.text}`}>
          {displayScore}
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
    </>
  );
}
