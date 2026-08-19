import { resolveBinary, runCli } from "./exec";
import type { EngineResult, NormalizedFinding, Severity } from "./types";

// Infrastructure-as-code misconfiguration scanning via `trivy config`.
//
// The other three engines look at code, secrets, and dependencies — none of them
// read the files that decide how the code is actually deployed. This covers
// Terraform, CloudFormation, Kubernetes manifests, Helm charts, and Dockerfiles,
// where the mistakes tend to be things like a storage bucket left public, a
// container running as root, or an unrestricted security group.

// Subset of `trivy config --format json` output we consume.
interface TrivyOutput {
  Results?: Array<{
    Target?: string;
    Misconfigurations?: Array<{
      ID?: string;
      AVDID?: string;
      Title?: string;
      Description?: string;
      Message?: string;
      Resolution?: string;
      Severity?: string; // CRITICAL | HIGH | MEDIUM | LOW | UNKNOWN
      Status?: string; // FAIL | PASS
      PrimaryURL?: string;
      CauseMetadata?: { StartLine?: number; Provider?: string; Service?: string };
    }>;
  }>;
}

function normalizeSeverity(sev?: string): Severity {
  switch (sev?.toUpperCase()) {
    case "CRITICAL":
      return "critical";
    case "HIGH":
      return "high";
    case "LOW":
      return "low";
    case "MEDIUM":
      return "medium";
    default:
      return "medium";
  }
}

/**
 * Run trivy's IaC misconfiguration scanner against a directory.
 *
 * A repository with no infrastructure files is a normal, successful result: the
 * engine is available and simply reports nothing.
 */
export async function runTrivy(
  targetDir: string,
  timeoutMs = 120_000,
): Promise<EngineResult> {
  const start = Date.now();
  const binary = resolveBinary("trivy", "TRIVY_PATH");

  const res = await runCli(
    binary,
    ["config", "--format", "json", "--quiet", targetDir],
    { timeoutMs },
  );

  if (res.missing) {
    return {
      engine: "trivy",
      available: false,
      findings: [],
      error:
        "trivy is not installed. Install from github.com/aquasecurity/trivy/releases (or `brew install trivy`), then add it to PATH or set TRIVY_PATH.",
      durationMs: Date.now() - start,
    };
  }
  if (res.timedOut) {
    return {
      engine: "trivy",
      available: true,
      findings: [],
      error: "trivy timed out",
      durationMs: Date.now() - start,
    };
  }

  // No stdout is the normal shape for a repo with no infrastructure files.
  if (!res.stdout.trim()) {
    return {
      engine: "trivy",
      available: true,
      findings: [],
      error: res.stderr.trim() || undefined,
      durationMs: Date.now() - start,
    };
  }

  let data: TrivyOutput;
  try {
    data = JSON.parse(res.stdout);
  } catch (e) {
    return {
      engine: "trivy",
      available: true,
      findings: [],
      error: `trivy output could not be parsed: ${(e as Error).message}`,
      durationMs: Date.now() - start,
    };
  }

  const findings: NormalizedFinding[] = [];
  for (const result of data.Results ?? []) {
    for (const m of result.Misconfigurations ?? []) {
      // Trivy reports the checks that passed alongside the ones that failed.
      if (m.Status && m.Status.toUpperCase() !== "FAIL") continue;

      const ruleId = m.AVDID ?? m.ID ?? "unknown-rule";
      const title = m.Title ?? m.Message ?? ruleId;
      // Message says what is wrong here; Resolution says how to fix it. Both are
      // worth keeping — this is the text the LLM later turns into plain language.
      const message = [m.Message ?? m.Description, m.Resolution ? `Fix: ${m.Resolution}` : null]
        .filter(Boolean)
        .join(" ");

      findings.push({
        engine: "trivy",
        ruleId,
        severity: normalizeSeverity(m.Severity),
        title: title.slice(0, 140),
        filePath: result.Target,
        // Checks that apply to a whole file (most Dockerfile rules) report no
        // usable line; trivy expresses that as a missing or zero StartLine.
        line: m.CauseMetadata?.StartLine || undefined,
        rawMessage: message || title,
      });
    }
  }

  return {
    engine: "trivy",
    available: true,
    findings,
    durationMs: Date.now() - start,
  };
}
