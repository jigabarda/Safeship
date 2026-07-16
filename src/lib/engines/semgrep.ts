import { resolveBinary, runCli } from "./exec";
import type { EngineResult, NormalizedFinding, Severity } from "./types";

// Subset of semgrep JSON output we consume.
interface SemgrepOutput {
  results?: Array<{
    check_id?: string;
    path?: string;
    start?: { line?: number };
    extra?: {
      message?: string;
      severity?: string; // ERROR | WARNING | INFO
      metadata?: { cwe?: string[]; owasp?: string[] };
    };
  }>;
  errors?: Array<{ message?: string }>;
}

function normalizeSeverity(sev?: string): Severity {
  switch (sev?.toUpperCase()) {
    case "ERROR":
      return "high";
    case "WARNING":
      return "medium";
    case "INFO":
      return "low";
    default:
      return "medium";
  }
}

/**
 * Run semgrep (SAST) against a directory using its auto rule config.
 *
 * NOTE: semgrep has no native Windows build — on Windows without WSL/Docker the
 * binary will be missing and this returns `available: false`, which the pipeline
 * handles gracefully. It runs normally on macOS/Linux (incl. the deploy target).
 */
export async function runSemgrep(
  targetDir: string,
  timeoutMs = 180_000,
): Promise<EngineResult> {
  const start = Date.now();
  const binary = resolveBinary("semgrep", "SEMGREP_PATH");

  const res = await runCli(
    binary,
    ["scan", "--config", "auto", "--json", "--quiet", targetDir],
    { timeoutMs },
  );

  if (res.missing) {
    return {
      engine: "semgrep",
      available: false,
      findings: [],
      error:
        "semgrep is not installed (no native Windows build — use WSL/Docker, or run on Linux). Install: pip install semgrep.",
      durationMs: Date.now() - start,
    };
  }
  if (res.timedOut) {
    return {
      engine: "semgrep",
      available: true,
      findings: [],
      error: "semgrep timed out",
      durationMs: Date.now() - start,
    };
  }

  if (!res.stdout.trim()) {
    return {
      engine: "semgrep",
      available: true,
      findings: [],
      error: res.stderr.trim() || undefined,
      durationMs: Date.now() - start,
    };
  }

  let data: SemgrepOutput;
  try {
    data = JSON.parse(res.stdout);
  } catch (e) {
    return {
      engine: "semgrep",
      available: true,
      findings: [],
      error: `semgrep output could not be parsed: ${(e as Error).message}`,
      durationMs: Date.now() - start,
    };
  }

  const findings: NormalizedFinding[] = (data.results ?? []).map((r) => ({
    engine: "semgrep",
    ruleId: r.check_id ?? "unknown-rule",
    severity: normalizeSeverity(r.extra?.severity),
    title: r.extra?.message?.split("\n")[0]?.slice(0, 140) ?? r.check_id ?? "Code issue",
    filePath: r.path,
    line: r.start?.line,
    rawMessage: r.extra?.message ?? r.check_id ?? "Static analysis finding",
  }));

  return {
    engine: "semgrep",
    available: true,
    findings,
    durationMs: Date.now() - start,
  };
}
