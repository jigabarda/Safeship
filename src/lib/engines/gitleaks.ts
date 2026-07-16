import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveBinary, runCli } from "./exec";
import type { EngineResult, NormalizedFinding } from "./types";

/** Shape of a single gitleaks JSON finding (subset we use). */
interface GitleaksFinding {
  Description?: string;
  StartLine?: number;
  File?: string;
  RuleID?: string;
  Secret?: string;
  Match?: string;
}

/**
 * Run gitleaks against a directory of files on disk (not git history).
 * gitleaks exits 1 when leaks are found — that is success, not failure.
 */
export async function runGitleaks(
  targetDir: string,
  timeoutMs = 120_000,
): Promise<EngineResult> {
  const start = Date.now();
  const binary = resolveBinary("gitleaks", "GITLEAKS_PATH");
  const reportDir = await mkdtemp(join(tmpdir(), "safeship-gitleaks-"));
  const reportPath = join(reportDir, `${randomUUID()}.json`);

  try {
    const res = await runCli(
      binary,
      [
        "dir",
        targetDir,
        "--report-format",
        "json",
        "--report-path",
        reportPath,
        "--exit-code",
        "0", // don't fail the process when leaks are found
        "--no-banner",
      ],
      { timeoutMs },
    );

    if (res.missing) {
      return notInstalled(start);
    }
    if (res.timedOut) {
      return {
        engine: "gitleaks",
        available: true,
        findings: [],
        error: "gitleaks timed out",
        durationMs: Date.now() - start,
      };
    }

    let raw: string;
    try {
      raw = await readFile(reportPath, "utf8");
    } catch {
      // No report file usually means no findings.
      return {
        engine: "gitleaks",
        available: true,
        findings: [],
        durationMs: Date.now() - start,
      };
    }

    const parsed: GitleaksFinding[] = raw.trim() ? JSON.parse(raw) : [];
    const findings: NormalizedFinding[] = parsed.map((f) => ({
      engine: "gitleaks",
      ruleId: f.RuleID ?? "unknown-rule",
      // A leaked credential is always high-urgency.
      severity: "critical",
      title: f.Description ?? f.RuleID ?? "Potential secret leaked",
      filePath: f.File,
      line: f.StartLine,
      rawMessage: f.Description ?? f.Match ?? "Secret detected",
      secretValue: f.Secret ?? f.Match,
    }));

    return {
      engine: "gitleaks",
      available: true,
      findings,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return {
      engine: "gitleaks",
      available: true,
      findings: [],
      error: `gitleaks failed: ${(e as Error).message}`,
      durationMs: Date.now() - start,
    };
  } finally {
    await rm(reportDir, { recursive: true, force: true }).catch(() => {});
  }
}

function notInstalled(start: number): EngineResult {
  return {
    engine: "gitleaks",
    available: false,
    findings: [],
    error:
      "gitleaks is not installed. Install it from https://github.com/gitleaks/gitleaks/releases and add it to PATH (or set GITLEAKS_PATH).",
    durationMs: Date.now() - start,
  };
}
