import { db } from "../db";
import { explainFindingSafe, getLlmClient } from "../llm/index";
import { runEngineScan } from "./engineScan";
import { computeScore } from "./score";

const LLM_MAX_FINDINGS = Number(process.env.SCAN_LLM_MAX_FINDINGS ?? 40);
const LLM_CONCURRENCY = 2;

export interface RunScanOptions {
  /**
   * Test hook: scan a copy of this local directory instead of cloning from
   * GitHub. Passed straight through to the engine scan.
   */
  sourceDirOverride?: string;
}

/**
 * Run one scan end-to-end for a given Scan row id:
 * mark running → engine scan (clone + engines + redact) → LLM explain →
 * score → persist → mark done.
 *
 * The clone/engine/redact half lives in runEngineScan (engineScan.ts) so it can
 * also run standalone on a CI runner; this function owns only the DB + LLM work.
 */
export async function runScan(
  scanId: string,
  opts: RunScanOptions = {},
): Promise<void> {
  const scan = await db.scan.findUnique({
    where: { id: scanId },
    include: { user: true },
  });
  if (!scan) throw new Error(`Scan ${scanId} not found`);

  await db.scan.update({
    where: { id: scanId },
    data: { status: "running" },
  });

  try {
    // 1) Get REDACTED findings from the engines (clone + run + redact + cleanup).
    const { findings } = await runEngineScan({
      repoUrl: scan.repoUrl,
      token: scan.user.accessToken,
      sourceDirOverride: opts.sourceDirOverride,
    });

    // 2) LLM explain + persist. Cap how many findings hit the LLM.
    const llm = getLlmClient();
    let explainedCount = 0;

    await mapWithConcurrency(findings, LLM_CONCURRENCY, async (finding) => {
      let explanation =
        null as Awaited<ReturnType<typeof explainFindingSafe>> | null;
      const shouldExplain = explainedCount < LLM_MAX_FINDINGS;
      if (shouldExplain) {
        explainedCount++;
        explanation = await explainFindingSafe(
          {
            engine: finding.engine,
            ruleId: finding.ruleId,
            rawMessage: finding.rawMessage,
            severity: finding.severity,
          },
          llm,
        );
      }

      const priority =
        explanation?.output.priority ??
        (finding.severity === "critical" || finding.severity === "high"
          ? "fix_now"
          : finding.severity === "medium"
            ? "should_fix"
            : "minor");

      await db.finding.create({
        data: {
          scanId,
          engine: finding.engine,
          ruleId: finding.ruleId,
          severity: finding.severity,
          priority,
          title: explanation?.output.title ?? finding.title,
          filePath: finding.filePath,
          line: finding.line,
          rawMessage: finding.rawMessage,
          plainExplanation: explanation?.output.plainExplanation ?? null,
          suggestedFix: explanation?.output.suggestedFix ?? null,
          redacted: finding.redacted,
        },
      });
    });

    // 3) Score + finish.
    const score = computeScore(findings.map((f) => f.severity));
    await db.scan.update({
      where: { id: scanId },
      data: { status: "done", score, finishedAt: new Date() },
    });
  } catch (e) {
    await db.scan.update({
      where: { id: scanId },
      data: {
        status: "failed",
        error: friendlyError(e),
        finishedAt: new Date(),
      },
    });
    throw e;
  }
}

function friendlyError(e: unknown): string {
  const msg = (e as Error)?.message ?? String(e);
  if (/Authentication failed|403|401/.test(msg)) {
    return "Could not access the repository. Check that you granted Safeship access to it.";
  }
  if (/not found|404/.test(msg)) {
    return "Repository not found. It may be private or renamed.";
  }
  return "The scan failed unexpectedly. Please try again.";
}

/** Run an async mapper over items with a bounded number in flight. */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}
