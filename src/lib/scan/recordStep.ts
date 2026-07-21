import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { parseScanSteps, type ScanStepKey } from "./steps";

/**
 * Append a progress event to a scan's step log.
 *
 * Used by both topologies: the local (inline) pipeline calls it directly, and the
 * GitHub Actions runner reaches it over HTTP via POST /api/scan/progress.
 *
 * Never throws — progress reporting is cosmetic and must never break a scan.
 */
export async function recordScanStep(
  scanId: string,
  key: ScanStepKey,
): Promise<void> {
  try {
    const scan = await db.scan.findUnique({
      where: { id: scanId },
      select: { status: true, steps: true },
    });
    // Don't rewrite history for a scan that already finished.
    if (!scan || scan.status === "done" || scan.status === "failed") return;

    const events = parseScanSteps(scan.steps);
    // Idempotent: a repeated report of the current step is a no-op.
    if (events[events.length - 1]?.key === key) return;

    events.push({ key, at: new Date().toISOString() });
    await db.scan.update({
      where: { id: scanId },
      // Cast: a plain {key, at}[] is valid JSON, but Prisma's Json input union
      // doesn't infer array literals without help.
      data: { steps: events as unknown as Prisma.InputJsonValue },
    });
  } catch (e) {
    console.warn(`[scan ${scanId}] could not record step "${key}":`, e);
  }
}
