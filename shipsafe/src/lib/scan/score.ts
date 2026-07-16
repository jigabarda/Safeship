import type { Severity } from "../engines/types";

const PENALTY: Record<Severity, number> = {
  critical: 25,
  high: 12,
  medium: 5,
  low: 1,
};

/** Compute a 0–100 safety score from findings' severities (100 = clean). */
export function computeScore(severities: Severity[]): number {
  const total = severities.reduce((acc, s) => acc + (PENALTY[s] ?? 0), 0);
  return Math.max(0, 100 - total);
}
