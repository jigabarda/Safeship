import { computeScore } from "./score";
import type { Severity } from "../engines/types";

// Findings are reported one-per-vulnerability, but they are not fixed that way.
// A single dependency upgrade can clear dozens of advisories at once, and the
// AI fix already rewrites a whole file rather than one line. Reports were
// therefore asking people to work through a hundred rows when the real work was
// a dozen actions, with no way to see which of those actions was worth the most.
//
// This groups findings by the action that resolves them and scores each group by
// how much of the safety score it would recover.

export interface GroupableFinding {
  id: string;
  engine: string;
  ruleId: string;
  severity: string;
  title: string;
  filePath: string | null;
}

export type GroupKind = "package" | "file" | "other";

export interface FindingGroup {
  /** Stable within a report; used as a React key and for expand/collapse. */
  key: string;
  kind: GroupKind;
  /** The package or path the action applies to. */
  label: string;
  /** Imperative summary of the one action, e.g. "Upgrade axios". */
  action: string;
  findings: GroupableFinding[];
  worstSeverity: Severity;
  /** Points the safety score would recover if this group were resolved. */
  scoreGain: number;
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function isSeverity(value: string): value is Severity {
  return value in SEVERITY_RANK;
}

/**
 * osv titles are built as `${name}@${version}: ${summary}`. Split on the last
 * "@" of the head so scoped packages (`@babel/core@7.0.0`) survive intact.
 */
export function packageFromOsvTitle(title: string): string | null {
  const sep = title.indexOf(": ");
  const head = sep === -1 ? title : title.slice(0, sep);
  const at = head.lastIndexOf("@");
  if (at <= 0) return null; // no "@", or the name is only a leading "@"
  const name = head.slice(0, at).trim();
  return name.length > 0 ? name : null;
}

/** The package name *and* installed version an osv finding refers to. */
export function packageRefFromOsvTitle(
  title: string,
): { name: string; version: string } | null {
  const sep = title.indexOf(": ");
  const head = sep === -1 ? title : title.slice(0, sep);
  const at = head.lastIndexOf("@");
  if (at <= 0) return null;
  const name = head.slice(0, at).trim();
  const version = head.slice(at + 1).trim();
  return name && version ? { name, version } : null;
}

/**
 * Group findings by the action that resolves them:
 *   • a vulnerable dependency  → upgrading that package
 *   • anything with a file     → fixing that file, which is how the AI fix works
 *   • anything else            → left on its own
 */
export function groupFindings(findings: GroupableFinding[]): FindingGroup[] {
  const buckets = new Map<string, { kind: GroupKind; label: string; items: GroupableFinding[] }>();

  for (const f of findings) {
    let kind: GroupKind = "other";
    let label = f.title;

    const pkg = f.engine === "osv" ? packageFromOsvTitle(f.title) : null;
    if (pkg) {
      kind = "package";
      label = pkg;
    } else if (f.filePath) {
      kind = "file";
      label = f.filePath;
    }

    // Kind is part of the key so a package and a path can never collide.
    const key = `${kind}:${label}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.items.push(f);
    else buckets.set(key, { kind, label, items: [f] });
  }

  const allSeverities = findings.map((f) => f.severity).filter(isSeverity);
  const currentScore = computeScore(allSeverities);

  const groups: FindingGroup[] = [];
  for (const [key, bucket] of buckets) {
    const ids = new Set(bucket.items.map((f) => f.id));
    // What the score becomes once everything in this group is gone.
    const withoutGroup = findings
      .filter((f) => !ids.has(f.id))
      .map((f) => f.severity)
      .filter(isSeverity);

    const worstSeverity = bucket.items
      .map((f) => f.severity)
      .filter(isSeverity)
      .reduce<Severity>(
        (worst, s) => (SEVERITY_RANK[s] < SEVERITY_RANK[worst] ? s : worst),
        "low",
      );

    groups.push({
      key,
      kind: bucket.kind,
      label: bucket.label,
      action:
        bucket.kind === "package"
          ? `Upgrade ${bucket.label}`
          : bucket.kind === "file"
            ? `Fix ${bucket.label}`
            : bucket.label,
      findings: bucket.items,
      worstSeverity,
      scoreGain: Math.max(0, computeScore(withoutGroup) - currentScore),
    });
  }

  // Most score recovered first; ties broken by size, then severity, then name so
  // the order is stable between renders.
  return groups.sort(
    (a, b) =>
      b.scoreGain - a.scoreGain ||
      b.findings.length - a.findings.length ||
      SEVERITY_RANK[a.worstSeverity] - SEVERITY_RANK[b.worstSeverity] ||
      a.label.localeCompare(b.label),
  );
}

export interface GroupPlan {
  groups: FindingGroup[];
  /** Groups worth showing as "do these first". */
  top: FindingGroup[];
  /** Findings the top groups would clear between them. */
  coveredFindings: number;
  totalFindings: number;
  currentScore: number;
  /** Score once every top group is resolved. */
  projectedScore: number;
}

/**
 * Build the remediation plan for a report.
 *
 * Each group's own scoreGain understates it: the curve is steep near a clean
 * repo and shallow far from it, so clearing one package out of twenty barely
 * moves the number even when it removes thirty findings. Resolving several
 * together is what actually moves the score, so the plan carries the combined
 * projection rather than leaving people to add up marginal gains that look
 * discouraging one at a time.
 */
export function buildGroupPlan(findings: GroupableFinding[], topCount = 5): GroupPlan {
  const groups = groupFindings(findings);
  const top = groups.slice(0, topCount);
  const covered = new Set(top.flatMap((g) => g.findings.map((f) => f.id)));

  const severities = findings.map((f) => f.severity).filter(isSeverity);
  const remaining = findings
    .filter((f) => !covered.has(f.id))
    .map((f) => f.severity)
    .filter(isSeverity);

  return {
    groups,
    top,
    coveredFindings: covered.size,
    totalFindings: findings.length,
    currentScore: computeScore(severities),
    projectedScore: computeScore(remaining),
  };
}
