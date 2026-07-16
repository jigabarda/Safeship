export const PRIORITY_ORDER: Record<string, number> = {
  fix_now: 0,
  should_fix: 1,
  minor: 2,
};

export const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export interface OrderableFinding {
  priority: string;
  severity: string;
}

/** Sort findings: highest priority first, then by severity within a priority. */
export function byPriorityThenSeverity(a: OrderableFinding, b: OrderableFinding): number {
  const p = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
  if (p !== 0) return p;
  return (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
}
