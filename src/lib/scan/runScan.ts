import { db } from "../db";
import { fallbackPriority } from "../llm/prompt";
import { runEngineScan } from "./engineScan";
import { recordScanStep } from "./recordStep";
import { computeScore } from "./score";

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
    // (No "preparing" step locally — the engines are already installed here.)
    await recordScanStep(scanId, "scanning");
    const { findings } = await runEngineScan({
      repoUrl: scan.repoUrl,
      token: scan.user.accessToken,
      sourceDirOverride: opts.sourceDirOverride,
    });

    // 2) Persist in one bulk insert. NO eager LLM pass here — plain-language
    // explanations are generated lazily when a finding is opened
    // (/api/findings/[id]/explain), exactly like the GitHub Actions path.
    // Explaining every finding up front made local scans take many minutes on a
    // local model, for text the user may never look at.
    await recordScanStep(scanId, "reporting");

    if (findings.length > 0) {
      await db.finding.createMany({
        data: findings.map((finding) => ({
          scanId,
          engine: finding.engine,
          ruleId: finding.ruleId,
          severity: finding.severity,
          priority: fallbackPriority(finding.severity),
          title: finding.title,
          filePath: finding.filePath,
          line: finding.line,
          rawMessage: finding.rawMessage,
          plainExplanation: null,
          suggestedFix: null,
          redacted: finding.redacted,
        })),
      });
    }

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
