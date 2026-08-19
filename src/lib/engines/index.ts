import { runGitleaks } from "./gitleaks";
import { runOsv } from "./osv";
import { runSemgrep } from "./semgrep";
import { runTrivy } from "./trivy";
import type { EngineResult } from "./types";

export * from "./types";
export { runGitleaks } from "./gitleaks";
export { runOsv } from "./osv";
export { runSemgrep } from "./semgrep";
export { runTrivy } from "./trivy";

export interface AllEnginesResult {
  results: EngineResult[];
  /** Engines whose binary was not found. */
  missing: string[];
}

/**
 * Run every engine against a directory, in parallel. Never throws — each engine
 * captures its own failures into its EngineResult so one broken engine can't
 * sink the scan.
 */
export async function runAllEngines(
  targetDir: string,
  timeoutMs = 120_000,
): Promise<AllEnginesResult> {
  const results = await Promise.all([
    runGitleaks(targetDir, timeoutMs),
    runOsv(targetDir, timeoutMs),
    runSemgrep(targetDir, timeoutMs),
    runTrivy(targetDir, timeoutMs),
  ]);

  return {
    results,
    missing: results.filter((r) => !r.available).map((r) => r.engine),
  };
}
