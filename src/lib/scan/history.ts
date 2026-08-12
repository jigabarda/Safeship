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
