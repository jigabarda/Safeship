import { db } from "@/lib/db";

/** How many prior scores to keep for the sparkline (plus the current scan = one more point). */
const MAX_TREND_POINTS = 11;

/**
 * Prior completed scores for a repo, oldest → newest, for the score-trend
 * sparkline and the "since last scan" delta. Only finished scans with a real
 * score count; the current scan is excluded via `before` so the caller can
 * append its (possibly live-recomputed) score as the final point.
 */
export async function getRepoScoreHistory(
  userId: string,
  repoFullName: string,
  before: Date,
): Promise<number[]> {
  const rows = await db.scan.findMany({
    where: {
      userId,
      repoFullName,
      status: "done",
      score: { not: null },
      createdAt: { lt: before },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_TREND_POINTS,
    select: { score: true },
  });
  // Query is newest-first (so `take` keeps the most recent); flip to oldest-first
  // for left-to-right plotting.
  return rows
    .map((r) => r.score)
    .filter((s): s is number => s !== null)
    .reverse();
}

export interface RepoScoreSummary {
  /** Most recent completed score. */
  score: number;
  /** Change vs. the scan before it; null when there's only ever been one. */
  delta: number | null;
}

/**
 * Latest score (and change since the prior scan) for each repo the user has
 * scanned. Used to annotate the repository list so it reads as a posture
 * overview, not just a launcher. Keyed by `repoFullName`.
 */
export async function getRepoLatestScores(
  userId: string,
): Promise<Record<string, RepoScoreSummary>> {
  const rows = await db.scan.findMany({
    where: { userId, status: "done", score: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { repoFullName: true, score: true },
  });

  // Walk newest → oldest, keeping the first (latest) and second score per repo.
  const summary: Record<string, RepoScoreSummary> = {};
  const secondSeen = new Set<string>();
  for (const { repoFullName, score } of rows) {
    if (score === null) continue;
    if (!(repoFullName in summary)) {
      summary[repoFullName] = { score, delta: null };
    } else if (!secondSeen.has(repoFullName)) {
      summary[repoFullName].delta = summary[repoFullName].score - score;
      secondSeen.add(repoFullName);
    }
  }
  return summary;
}
