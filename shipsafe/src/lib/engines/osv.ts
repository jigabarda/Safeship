import { resolveBinary, runCli } from "./exec";
import type { EngineResult, NormalizedFinding, Severity } from "./types";

// Subset of osv-scanner JSON output we consume.
interface OsvOutput {
  results?: Array<{
    source?: { path?: string };
    packages?: Array<{
      package?: { name?: string; version?: string; ecosystem?: string };
      vulnerabilities?: Array<{
        id?: string;
        summary?: string;
        aliases?: string[];
        database_specific?: { severity?: string };
        severity?: Array<{ type?: string; score?: string }>;
      }>;
      groups?: Array<{ ids?: string[]; max_severity?: string }>;
    }>;
  }>;
}

/** Map an OSV/GHSA severity label or CVSS score into our normalized buckets. */
function normalizeSeverity(label?: string, cvssScore?: string): Severity {
  const l = label?.toUpperCase();
  if (l === "CRITICAL") return "critical";
  if (l === "HIGH") return "high";
  if (l === "MODERATE" || l === "MEDIUM") return "medium";
  if (l === "LOW") return "low";

  const score = cvssScore ? parseFloat(cvssScore) : NaN;
  if (!Number.isNaN(score)) {
    if (score >= 9) return "critical";
    if (score >= 7) return "high";
    if (score >= 4) return "medium";
    return "low";
  }
  // Unknown severity for a known vuln — treat as medium so it isn't ignored.
  return "medium";
}

/**
 * Run osv-scanner against a directory. It inspects lockfiles/manifests and
 * checks dependencies against the OSV vulnerability database. Exits non-zero
 * when vulnerabilities are found — that is success, not failure.
 */
export async function runOsv(
  targetDir: string,
  timeoutMs = 120_000,
): Promise<EngineResult> {
  const start = Date.now();
  const binary = resolveBinary("osv-scanner", "OSV_SCANNER_PATH");

  const res = await runCli(
    binary,
    ["scan", "--format", "json", "--recursive", targetDir],
    { timeoutMs },
  );

  if (res.missing) {
    return {
      engine: "osv",
      available: false,
      findings: [],
      error:
        "osv-scanner is not installed. Install it from https://github.com/google/osv-scanner/releases and add it to PATH (or set OSV_SCANNER_PATH).",
      durationMs: Date.now() - start,
    };
  }
  if (res.timedOut) {
    return {
      engine: "osv",
      available: true,
      findings: [],
      error: "osv-scanner timed out",
      durationMs: Date.now() - start,
    };
  }

  if (!res.stdout.trim()) {
    // No JSON usually means no lockfiles found / nothing to report.
    return {
      engine: "osv",
      available: true,
      findings: [],
      durationMs: Date.now() - start,
    };
  }

  let data: OsvOutput;
  try {
    data = JSON.parse(res.stdout);
  } catch (e) {
    return {
      engine: "osv",
      available: true,
      findings: [],
      error: `osv-scanner output could not be parsed: ${(e as Error).message}`,
      durationMs: Date.now() - start,
    };
  }

  const findings: NormalizedFinding[] = [];
  for (const result of data.results ?? []) {
    const sourcePath = result.source?.path;
    for (const pkg of result.packages ?? []) {
      const name = pkg.package?.name ?? "unknown package";
      const version = pkg.package?.version ?? "?";
      const maxSeverity = pkg.groups?.[0]?.max_severity;
      for (const vuln of pkg.vulnerabilities ?? []) {
        const cvss = vuln.severity?.find((s) => s.type?.startsWith("CVSS"))?.score;
        const severity = normalizeSeverity(
          vuln.database_specific?.severity,
          cvss ?? maxSeverity,
        );
        const id = vuln.id ?? vuln.aliases?.[0] ?? "UNKNOWN-VULN";
        findings.push({
          engine: "osv",
          ruleId: id,
          severity,
          title: `${name}@${version}: ${vuln.summary ?? id}`,
          filePath: sourcePath,
          rawMessage:
            vuln.summary ?? `Known vulnerability ${id} in ${name}@${version}`,
        });
      }
    }
  }

  return {
    engine: "osv",
    available: true,
    findings,
    durationMs: Date.now() - start,
  };
}
