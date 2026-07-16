// Shared presentation helpers — safe to import from both server and client
// components (no server-only dependencies).

export type Priority = "fix_now" | "should_fix" | "minor";

export const PRIORITY_META: Record<
  Priority,
  { label: string; emoji: string; blurb: string; accent: string }
> = {
  fix_now: {
    label: "Fix now",
    emoji: "🔴",
    blurb: "Serious — worth fixing before you ship.",
    accent: "text-red-600 dark:text-red-400",
  },
  should_fix: {
    label: "Should fix",
    emoji: "🟠",
    blurb: "Real issues to clean up soon.",
    accent: "text-amber-600 dark:text-amber-400",
  },
  minor: {
    label: "Minor",
    emoji: "🟡",
    blurb: "Low impact — good to know about.",
    accent: "text-yellow-600 dark:text-yellow-500",
  },
};

export const PRIORITY_SORT: Priority[] = ["fix_now", "should_fix", "minor"];

export function isPriority(v: string): v is Priority {
  return v === "fix_now" || v === "should_fix" || v === "minor";
}

/** Human-friendly label for a normalized severity. */
export function severityLabel(sev: string): string {
  return sev.charAt(0).toUpperCase() + sev.slice(1);
}

/** Tailwind classes + label describing a 0–100 score. */
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
  return { label: "Fix before shipping", ring: "ring-red-500", text: "text-red-600 dark:text-red-400" };
}

/** e.g. "octocat/hello-world" → "hello-world". */
export function repoShortName(fullName: string): string {
  return fullName.split("/").slice(-1)[0] ?? fullName;
}
