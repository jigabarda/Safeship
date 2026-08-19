"use client";

import { useState } from "react";
import { SEVERITY_META, severityLabel, isSeverity } from "@/lib/ui";
import type { FindingGroup, GroupPlan } from "@/lib/scan/groups";

/**
 * "Fix these first" — the report's findings collapsed into the actions that
 * resolve them, biggest first. A hundred rows is a list; a dozen actions is a
 * plan, and this is the difference between the two.
 */
export function FixPlan({ plan, onSelectFinding }: { plan: GroupPlan; onSelectFinding?: (id: string) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Grouping only helps when it actually condenses something.
  if (plan.totalFindings === 0 || plan.groups.length < 2) return null;
  if (plan.groups.length >= plan.totalFindings) return null;

  const visible = showAll ? plan.groups : plan.top;
  const gain = plan.projectedScore - plan.currentScore;

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold">Fix these first</h2>
        <p className="text-xs text-muted">
          {plan.totalFindings} findings · {plan.groups.length} actions
        </p>
      </div>

      {gain > 0 && (
        <p className="mt-1 text-sm text-muted">
          The top {plan.top.length} clear{" "}
          <strong className="text-foreground">
            {plan.coveredFindings} of {plan.totalFindings}
          </strong>{" "}
          findings — taking your score from{" "}
          <strong className="text-foreground">{plan.currentScore}</strong> to{" "}
          <strong className="text-emerald-600 dark:text-emerald-400">{plan.projectedScore}</strong>.
        </p>
      )}

      <ul className="mt-4 flex flex-col divide-y divide-line">
        {visible.map((g) => (
          <GroupRow
            key={g.key}
            group={g}
            open={expanded === g.key}
            onToggle={() => setExpanded(expanded === g.key ? null : g.key)}
            onSelectFinding={onSelectFinding}
          />
        ))}
      </ul>

      {plan.groups.length > plan.top.length && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-xs font-medium text-muted underline underline-offset-2 transition-colors hover:text-foreground"
        >
          {showAll
            ? "Show top actions only"
            : `Show all ${plan.groups.length} actions →`}
        </button>
      )}
    </section>
  );
}

function GroupRow({
  group,
  open,
  onToggle,
  onSelectFinding,
}: {
  group: FindingGroup;
  open: boolean;
  onToggle: () => void;
  onSelectFinding?: (id: string) => void;
}) {
  const sev = isSeverity(group.worstSeverity) ? group.worstSeverity : null;

  return (
    <li className="py-2.5">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}
          >
            ›
          </span>
          <span className="truncate text-sm font-medium">{group.action}</span>
          {sev && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_META[sev].pill}`}
            >
              {severityLabel(sev)}
            </span>
          )}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {group.findings.length} finding{group.findings.length === 1 ? "" : "s"}
        </span>
      </button>

      {open && (
        <ul className="mt-2 flex flex-col gap-1 pl-6">
          {group.findings.map((f) => (
            <li key={f.id}>
              <button
                onClick={() => onSelectFinding?.(f.id)}
                disabled={!onSelectFinding}
                className="w-full truncate text-left text-xs text-muted transition-colors hover:text-foreground disabled:hover:text-muted"
                title={f.title}
              >
                {f.ruleId}
                <span aria-hidden> · </span>
                {f.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
