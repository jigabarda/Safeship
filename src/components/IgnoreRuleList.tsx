"use client";

import { useMemo, useState } from "react";
import { severityLabel, SEVERITY_META, isSeverity } from "@/lib/ui";

export interface IgnoreRuleRow {
  id: string;
  repoFullName: string;
  engine: string;
  ruleId: string;
  filePath: string;
  reason: string;
  title: string | null;
  severity: string | null;
  createdAt: string;
}

const REASON_LABEL: Record<string, string> = {
  false_positive: "False positive",
  accepted_risk: "Accepted risk",
  wont_fix: "Won't fix",
};

/**
 * The user's baseline: every finding they've chosen to ignore, grouped by repo,
 * each revocable. Revoking brings the finding back on this repo's reports and on
 * future scans.
 */
export function IgnoreRuleList({ rules }: { rules: IgnoreRuleRow[] }) {
  const [revoked, setRevoked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => rules.filter((r) => !revoked.has(r.id)), [rules, revoked]);

  const grouped = useMemo(() => {
    const map = new Map<string, IgnoreRuleRow[]>();
    for (const r of visible) {
      const list = map.get(r.repoFullName);
      if (list) list.push(r);
      else map.set(r.repoFullName, [r]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  async function revoke(id: string) {
    setError(null);
    setBusy(id);
    setRevoked((prev) => new Set(prev).add(id)); // optimistic
    try {
      const res = await fetch(`/api/ignore-rules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not revoke that rule.");
    } catch (e) {
      setRevoked((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (visible.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong bg-surface/50 px-4 py-10 text-center text-sm text-muted">
        Nothing ignored yet. When you dismiss a finding on a scan report, the rule
        shows up here — and stays out of future scans until you revoke it.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}
      {grouped.map(([repo, rows]) => (
        <section key={repo} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="truncate text-sm font-semibold">{repo}</h2>
            <span className="shrink-0 text-xs text-muted">
              {rows.length} ignored{rows.length === 1 ? "" : ""}
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="truncate">{r.title ?? r.ruleId}</span>
                    {r.severity && isSeverity(r.severity) && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_META[r.severity].pill}`}
                      >
                        {severityLabel(r.severity)}
                      </span>
                    )}
                    <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted ring-1 ring-line">
                      {REASON_LABEL[r.reason] ?? "Ignored"}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {r.filePath || "repository-wide"}
                    <span aria-hidden> · </span>
                    {r.engine}
                    <span aria-hidden> · </span>
                    {r.ruleId}
                  </p>
                </div>
                <button
                  onClick={() => revoke(r.id)}
                  disabled={busy === r.id}
                  title="Stop ignoring this — it will be reported again"
                  className="shrink-0 rounded-full border border-line px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-foreground disabled:opacity-50"
                >
                  {busy === r.id ? "Revoking…" : "Revoke"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
