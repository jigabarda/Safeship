import type { Severity } from "../engines/types";

// How the safety score works.
//
// Each finding contributes a penalty by severity, and the total is mapped onto
// 0–100 through a curve rather than subtracted from 100. Subtraction looked
// natural but broke down in practice: a normal project with an ageing lockfile
// easily carries 60–100 *distinct* dependency advisories, which buries the total
// past 100 and floors every such repo at exactly 0. Scores that are all 0 can't
// rank repos, can't show a trend, and can't tell a user that fixing 20 things
// helped — the exact jobs the score exists to do.
//
// The curve is 100 / (1 + penalty / SCALE): it starts at 100 for a clean repo,
// falls steeply through the range where a repo is still fixable, and then
// flattens, so it keeps resolving differences long after subtraction would have
// bottomed out. Each additional finding matters a little less than the last,
// which also matches how risk actually accumulates.
//
// A curve alone would let sheer count decide the grade, so a repo with one
// critical could still look healthy. Severity therefore also imposes a ceiling:
// whatever the count says, an unfixed critical cannot present as fine.

const PENALTY: Record<Severity, number> = {
  critical: 25,
  high: 12,
  medium: 5,
  low: 1,
};

/** Penalty at which the curve has fallen to half. */
const SCALE = 100;

/** The best score still available while a finding of each severity is open. */
const SEVERITY_CEILING: Record<Severity, number> = {
  critical: 49, // "Needs attention" at best
  high: 79, // "Some cleanup needed" at best
  medium: 94,
  low: 100,
};

/** Compute a 0–100 safety score from findings' severities (100 = clean). */
export function computeScore(severities: Severity[]): number {
  if (severities.length === 0) return 100;

  const penalty = severities.reduce((acc, s) => acc + (PENALTY[s] ?? 0), 0);
  const curve = 100 / (1 + penalty / SCALE);

  const ceiling = severities.reduce(
    (lowest, s) => Math.min(lowest, SEVERITY_CEILING[s] ?? 100),
    100,
  );

  return Math.round(Math.min(curve, ceiling));
}
