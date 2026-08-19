"use client";

import { useMemo, useState } from "react";
import { SEVERITY_META, severityLabel, isSeverity } from "@/lib/ui";
import type { FindingGroup, GroupPlan } from "@/lib/scan/groups";

/**
 * "Fix these first" — the report's findings collapsed into the actions that
 * resolve them, biggest first. A hundred rows is a list; a dozen actions is a
 * plan, and this is the difference between the two.
 */
export function FixPlan({
  plan,
  scanId,
  directDeps = [],
  onSelectFinding,
}: {
  plan: GroupPlan;
  scanId: string;
  /** Packages the repo depends on directly — the only ones upgradable by PR. */
  directDeps?: string[];
  onSelectFinding?: (id: string) => void;
}) {
  const direct = useMemo(() => new Set(directDeps), [directDeps]);
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
            scanId={scanId}
            isDirect={g.kind === "package" && direct.has(g.label)}
            knowsDeps={directDeps.length > 0}
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
  scanId,
  isDirect,
  knowsDeps,
  open,
  onToggle,
  onSelectFinding,
}: {
  group: FindingGroup;
  scanId: string;
  isDirect: boolean;
  /** False when the manifest couldn't be read, so nothing is claimed either way. */
  knowsDeps: boolean;
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

      {open && group.kind === "package" && knowsDeps && (
        <div className="mt-2 pl-6">
          {isDirect ? (
            <UpgradeButton scanId={scanId} packageName={group.label} />
          ) : (
            <OverrideButton scanId={scanId} packageName={group.label} />
          )}
        </div>
      )}

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

/** Opens a pull request bumping this package in package.json. */
function UpgradeButton({ scanId, packageName }: { scanId: string; packageName: string }) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "working" }
    | { status: "done"; url: string; from: string; to: string; advisories: number }
    | { status: "error"; message: string }
  >({ status: "idle" });

  async function run() {
    setState({ status: "working" });
    try {
      const res = await fetch(`/api/scan/${scanId}/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: packageName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setState({
        status: "done",
        url: data.prUrl,
        from: data.from,
        to: data.to,
        advisories: data.advisories,
      });
    } catch (e) {
      setState({ status: "error", message: (e as Error).message });
    }
  }

  if (state.status === "done") {
    return (
      <p className="text-xs text-muted">
        Opened a pull request upgrading {packageName} from{" "}
        <code>{state.from}</code> to <code>{state.to}</code> —{" "}
        <a
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline underline-offset-2 hover:text-foreground"
        >
          review it on GitHub →
        </a>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={run}
        disabled={state.status === "working"}
        className="self-start rounded-full border border-line px-3 py-1 text-xs font-medium transition-colors hover:bg-surface-2 disabled:opacity-50"
      >
        {state.status === "working" ? "Opening pull request…" : "Upgrade with a pull request"}
      </button>
      {state.status === "error" && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{state.message}</p>
      )}
    </div>
  );
}

/**
 * Pins a transitive dependency with an npm override. Separate from the upgrade
 * button because the explanation matters: this package isn't declared here, so
 * the user needs to know what is being forced and why before they click.
 */
function OverrideButton({ scanId, packageName }: { scanId: string; packageName: string }) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "working" }
    | { status: "done"; url: string; from: string; to: string; advisories: number; majorChange: boolean }
    | { status: "error"; message: string }
  >({ status: "idle" });

  async function run() {
    setState({ status: "working" });
    try {
      const res = await fetch(`/api/scan/${scanId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packages: [packageName] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      const pinned = data.pinned?.[0];
      setState({
        status: "done",
        url: data.prUrl,
        from: pinned?.from ?? "",
        to: pinned?.to ?? "",
        advisories: data.advisoriesResolved ?? 0,
        majorChange: Boolean(pinned?.majorChange),
      });
    } catch (e) {
      setState({ status: "error", message: (e as Error).message });
    }
  }

  if (state.status === "done") {
    return (
      <p className="text-xs text-muted">
        Opened a pull request pinning {packageName} from <code>{state.from}</code> to{" "}
        <code>{state.to}</code>
        {state.majorChange ? " (a major version change — check the changelog)" : ""} —{" "}
        <a
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline underline-offset-2 hover:text-foreground"
        >
          review it on GitHub →
        </a>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted">
        <strong className="font-medium">Transitive dependency</strong> — not listed in
        package.json, so there is no version here to raise. An npm{" "}
        <code>overrides</code> entry can force the patched version anyway.
      </p>
      <button
        onClick={run}
        disabled={state.status === "working"}
        className="self-start rounded-full border border-line px-3 py-1 text-xs font-medium transition-colors hover:bg-surface-2 disabled:opacity-50"
      >
        {state.status === "working" ? "Opening pull request…" : "Pin with an override"}
      </button>
      {state.status === "error" && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{state.message}</p>
      )}
    </div>
  );
}
