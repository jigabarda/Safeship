// Shared presentation helpers — safe to import from both server and client
// components (no server-only dependencies).

export type Priority = "fix_now" | "should_fix" | "minor";

interface PriorityMeta {
  label: string;
  blurb: string;
  /** Accent text color for headings/labels. */
  text: string;
  /** Small status dot background. */
  dot: string;
  /** Badge: soft background + readable text + hairline ring. */
  pill: string;
  /** Left accent bar on a finding card. */
  bar: string;
}

export const PRIORITY_META: Record<Priority, PriorityMeta> = {
  fix_now: {
    label: "Fix now",
    blurb: "Serious — worth handling before you ship.",
    text: "text-rose-600 dark:text-rose-400",
    dot: "bg-rose-500",
    pill: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
    bar: "bg-rose-500",
  },
  should_fix: {
    label: "Should fix",
    blurb: "Real issues to clean up soon.",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
    bar: "bg-amber-500",
  },
  minor: {
    label: "Minor",
    blurb: "Low impact — good to know about.",
    text: "text-sky-600 dark:text-sky-400",
    dot: "bg-sky-500",
    pill: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20",
    bar: "bg-sky-500",
  },
};

export const PRIORITY_SORT: Priority[] = ["fix_now", "should_fix", "minor"];

export function isPriority(v: string): v is Priority {
  return v === "fix_now" || v === "should_fix" || v === "minor";
}

export type Severity = "critical" | "high" | "medium" | "low";

export const SEVERITY_SORT: Severity[] = ["critical", "high", "medium", "low"];

/** Badge styles per normalized severity. */
export const SEVERITY_META: Record<Severity, { label: string; pill: string }> = {
  critical: {
    label: "Critical",
    pill: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
  },
  high: {
    label: "High",
    pill: "bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/20",
  },
  medium: {
    label: "Medium",
    pill: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
  },
  low: {
    label: "Low",
    pill: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-300 dark:ring-zinc-400/20",
  },
};

export function isSeverity(v: string): v is Severity {
  return v === "critical" || v === "high" || v === "medium" || v === "low";
}

/** Human-friendly label for a normalized severity. */
export function severityLabel(sev: string): string {
  return sev.charAt(0).toUpperCase() + sev.slice(1);
}

/** Description + colors for a 0–100 safety score. `text` doubles as the gauge stroke (currentColor). */
export function scoreMeta(score: number): {
  label: string;
  ring: string;
  text: string;
} {
  if (score >= 85)
    return { label: "Looking good", ring: "ring-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };
  if (score >= 60)
    return { label: "Some cleanup needed", ring: "ring-amber-500", text: "text-amber-600 dark:text-amber-400" };
  if (score >= 30)
    return { label: "Needs attention", ring: "ring-orange-500", text: "text-orange-600 dark:text-orange-400" };
  return { label: "Fix before shipping", ring: "ring-rose-500", text: "text-rose-600 dark:text-rose-400" };
}

/** e.g. "octocat/hello-world" → "hello-world". */
export function repoShortName(fullName: string): string {
  return fullName.split("/").slice(-1)[0] ?? fullName;
}
