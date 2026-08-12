// Diff two scans of the same repo: which findings were fixed, which are new,
// and which carried over. Pure logic — the page fetches the findings and hands
// them here, so it's easy to test and reason about.

export interface ComparableFinding {
  id: string;
  engine: string;
  ruleId: string;
  severity: string;
  priority: string;
  title: string;
  filePath: string | null;
  line: number | null;
}

/**
 * Identity of a finding for cross-scan matching. Line numbers are deliberately
 * excluded — they drift as unrelated code moves, which would make a matched
 * finding look "fixed then reintroduced." Engine + rule + file is stable enough
 * to answer "is this the same problem as last time?".
 */
function findingKey(f: ComparableFinding): string {
  return `${f.engine}|${f.ruleId}|${f.filePath ?? ""}`;
}

export interface ScanDiff {
  /** In the baseline but gone in the newer scan — resolved. */
  fixed: ComparableFinding[];
  /** New in the newer scan — introduced since the baseline. */
  added: ComparableFinding[];
  /** Present in both scans. */
  carriedOver: number;
}

/**
 * Compare a baseline scan's findings to a newer scan's findings.
 * `base` = the older scan, `current` = the newer one.
 */
export function diffScans(
  base: ComparableFinding[],
  current: ComparableFinding[],
): ScanDiff {
  const baseKeys = new Set(base.map(findingKey));
  const currentKeys = new Set(current.map(findingKey));

  const fixed = base.filter((f) => !currentKeys.has(findingKey(f)));
  const added = current.filter((f) => !baseKeys.has(findingKey(f)));
  const carriedOver = current.filter((f) => baseKeys.has(findingKey(f))).length;

  return { fixed, added, carriedOver };
}
