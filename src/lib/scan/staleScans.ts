import { db } from "../db";

// A scan normally finishes in about a minute, and the GitHub Actions workflow
// caps itself at 20. Past this window the scanner is never coming back — the
// runner died, the dispatch was lost, or the callback never arrived.
export const SCAN_STALE_AFTER_MS = 25 * 60 * 1000;

export const STALE_SCAN_ERROR =
  "This scan timed out — the scanner never reported back. Please try again.";

const UNFINISHED = ["queued", "running"];

/** True when an unfinished scan is old enough to be considered dead. */
export function isScanStale(status: string, createdAt: Date): boolean {
  return (
    UNFINISHED.includes(status) &&
    Date.now() - createdAt.getTime() > SCAN_STALE_AFTER_MS
  );
}

/**
 * Expire one scan if it has gone stale. Returns true when it was expired, so the
 * caller can reflect the new state without re-querying.
 */
export async function failScanIfStale(scan: {
  id: string;
  status: string;
  createdAt: Date;
}): Promise<boolean> {
  if (!isScanStale(scan.status, scan.createdAt)) return false;
  await db.scan.update({
    where: { id: scan.id },
    data: {
      status: "failed",
      error: STALE_SCAN_ERROR,
      finishedAt: new Date(),
    },
  });
  return true;
}

/**
 * Bulk-expire a user's abandoned scans. Without this, any lost runner leaves a
 * row stuck on "running" forever. Cheap enough to call on a page load, so no
 * cron/background worker is needed (which serverless can't run anyway).
 */
export async function failStaleScans(userId: string): Promise<number> {
  const { count } = await db.scan.updateMany({
    where: {
      userId,
      status: { in: UNFINISHED },
      createdAt: { lt: new Date(Date.now() - SCAN_STALE_AFTER_MS) },
    },
    data: {
      status: "failed",
      error: STALE_SCAN_ERROR,
      finishedAt: new Date(),
    },
  });
  return count;
}
