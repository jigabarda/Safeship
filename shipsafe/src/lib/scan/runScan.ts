import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit from "simple-git";
import { db } from "../db";
import { runAllEngines } from "../engines/index";
import type { NormalizedFinding } from "../engines/types";
import {
  explainFindingSafe,
  getLlmClient,
  redactText,
} from "../llm/index";
import { computeScore } from "./score";

const ENGINE_TIMEOUT_MS = Number(process.env.SCAN_ENGINE_TIMEOUT_MS ?? 120_000);
const LLM_MAX_FINDINGS = Number(process.env.SCAN_LLM_MAX_FINDINGS ?? 40);
const LLM_CONCURRENCY = 2;

export interface RunScanOptions {
  /**
   * Test hook: scan a copy of this local directory instead of cloning from
   * GitHub. The directory is copied into a throwaway workdir which is deleted
   * afterward (the original is never touched).
   */
  sourceDirOverride?: string;
}

/**
 * Run one scan end-to-end for a given Scan row id:
 * clone → engines → redact → LLM explain → score → persist → cleanup.
 * Never leaves cloned code on disk (try/finally).
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

  const workdir = await mkdtemp(join(tmpdir(), "safeship-scan-"));

  try {
    // 1) Get the code onto disk.
    if (opts.sourceDirOverride) {
      await cp(opts.sourceDirOverride, workdir, { recursive: true });
    } else {
      await cloneRepo(scan.repoUrl, scan.user.accessToken, workdir);
    }

    // 2) Run engines.
    const { results } = await runAllEngines(workdir, ENGINE_TIMEOUT_MS);
    const rawFindings: NormalizedFinding[] = results.flatMap((r) => r.findings);

    // 3) LLM explain + redact + persist. Cap how many findings hit the LLM.
    const llm = getLlmClient();
    let explainedCount = 0;

    await mapWithConcurrency(rawFindings, LLM_CONCURRENCY, async (finding) => {
      // Redact BEFORE anything is stored or sent to the LLM.
      const knownSecrets = finding.secretValue ? [finding.secretValue] : [];
      const redactedMessage = redactText(finding.rawMessage, knownSecrets);
      const redactedTitle = redactText(finding.title, knownSecrets);
      const wasRedacted =
        redactedMessage.redacted || redactedTitle.redacted || !!finding.secretValue;

      // Strip the raw secret from memory before it can leak into the LLM input.
      const safeFinding: NormalizedFinding = {
        ...finding,
        title: redactedTitle.text,
        rawMessage: redactedMessage.text,
        secretValue: undefined,
      };

      let explanation = null as Awaited<ReturnType<typeof explainFindingSafe>> | null;
      const shouldExplain = explainedCount < LLM_MAX_FINDINGS;
      if (shouldExplain) {
        explainedCount++;
        explanation = await explainFindingSafe(
          {
            engine: safeFinding.engine,
            ruleId: safeFinding.ruleId,
            rawMessage: safeFinding.rawMessage,
            severity: safeFinding.severity,
          },
          llm,
        );
      }

      const priority =
        explanation?.output.priority ??
        (safeFinding.severity === "critical" || safeFinding.severity === "high"
          ? "fix_now"
          : safeFinding.severity === "medium"
            ? "should_fix"
            : "minor");

      await db.finding.create({
        data: {
          scanId,
          engine: safeFinding.engine,
          ruleId: safeFinding.ruleId,
          severity: safeFinding.severity,
          priority,
          title: explanation?.output.title ?? safeFinding.title,
          filePath: relativizePath(safeFinding.filePath, workdir),
          line: safeFinding.line ?? null,
          rawMessage: safeFinding.rawMessage,
          plainExplanation: explanation?.output.plainExplanation ?? null,
          suggestedFix: explanation?.output.suggestedFix ?? null,
          redacted: wasRedacted,
        },
      });
    });

    // 4) Score + finish.
    const score = computeScore(rawFindings.map((f) => f.severity));
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
  } finally {
    // 5) ALWAYS delete the working copy of the code.
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

async function cloneRepo(repoUrl: string, token: string, dest: string) {
  const authedUrl = repoUrl.replace(
    /^https:\/\//,
    `https://x-access-token:${token}@`,
  );
  const git = simpleGit();
  await git.clone(authedUrl, dest, ["--depth", "1"]);
}

/** Make engine file paths relative to the scan workdir for display. */
function relativizePath(p: string | undefined, workdir: string): string | null {
  if (!p) return null;
  const normalized = p.replace(/\\/g, "/");
  const base = workdir.replace(/\\/g, "/");
  if (normalized.startsWith(base)) {
    return normalized.slice(base.length).replace(/^\/+/, "");
  }
  return normalized;
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
