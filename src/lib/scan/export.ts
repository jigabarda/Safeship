// Machine-readable exports of a scan's findings.
//
// The print view is for a person; these two are for everything else. SARIF is
// what GitHub's code-scanning tab and most security tooling ingest, so a scan
// can be pushed back into the workflow the code already lives in. CSV is for
// spreadsheets and ticket trackers, where findings get triaged by hand.
//
// Both are pure functions over already-stored findings: whatever redaction the
// scan pipeline applied is what ends up in the file.

export interface ExportableFinding {
  engine: string;
  ruleId: string;
  severity: string;
  priority: string;
  title: string;
  filePath: string | null;
  line: number | null;
  rawMessage: string;
  plainExplanation: string | null;
  suggestedFix: string | null;
  redacted: boolean;
}

export interface ExportScan {
  id: string;
  repoFullName: string;
  score: number | null;
  createdAt: Date;
}

/** SARIF has four levels; our four severities collapse onto three of them. */
function sarifLevel(severity: string): "error" | "warning" | "note" {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    default:
      return "note";
  }
}

const ENGINE_URI: Record<string, string> = {
  gitleaks: "https://github.com/gitleaks/gitleaks",
  osv: "https://github.com/google/osv-scanner",
  semgrep: "https://semgrep.dev",
  trivy: "https://github.com/aquasecurity/trivy",
};

/**
 * SARIF 2.1.0. One run per engine, which is the shape consumers expect — it
 * keeps each tool's rules attributable to that tool rather than merging four
 * rule namespaces into one.
 */
export function toSarif(scan: ExportScan, findings: ExportableFinding[]): string {
  const byEngine = new Map<string, ExportableFinding[]>();
  for (const f of findings) {
    const list = byEngine.get(f.engine);
    if (list) list.push(f);
    else byEngine.set(f.engine, [f]);
  }

  const runs = [...byEngine.entries()].map(([engine, engineFindings]) => {
    // One rule entry per distinct ruleId, referenced by index from each result.
    const ruleIds: string[] = [];
    const ruleIndex = new Map<string, number>();
    for (const f of engineFindings) {
      if (!ruleIndex.has(f.ruleId)) {
        ruleIndex.set(f.ruleId, ruleIds.length);
        ruleIds.push(f.ruleId);
      }
    }

    const rules = ruleIds.map((id) => {
      const example = engineFindings.find((f) => f.ruleId === id);
      return {
        id,
        name: id,
        shortDescription: { text: example?.title ?? id },
        ...(example?.plainExplanation
          ? { fullDescription: { text: example.plainExplanation } }
          : {}),
        ...(example?.suggestedFix ? { help: { text: example.suggestedFix } } : {}),
        properties: { tags: [engine], severity: example?.severity },
      };
    });

    return {
      tool: {
        driver: {
          name: engine,
          informationUri: ENGINE_URI[engine] ?? "https://github.com/jigabarda/Safeship",
          rules,
        },
      },
      results: engineFindings.map((f) => ({
        ruleId: f.ruleId,
        ruleIndex: ruleIndex.get(f.ruleId) ?? 0,
        level: sarifLevel(f.severity),
        message: { text: f.rawMessage || f.title },
        ...(f.filePath
          ? {
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: f.filePath },
                    // SARIF regions are 1-based; a finding without a usable line
                    // omits the region rather than claiming line 0.
                    ...(f.line && f.line > 0 ? { region: { startLine: f.line } } : {}),
                  },
                },
              ],
            }
          : {}),
        properties: {
          severity: f.severity,
          priority: f.priority,
          redacted: f.redacted,
        },
      })),
    };
  });

  return JSON.stringify(
    {
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      version: "2.1.0",
      properties: {
        repository: scan.repoFullName,
        scanId: scan.id,
        score: scan.score,
        scannedAt: scan.createdAt.toISOString(),
      },
      runs,
    },
    null,
    2,
  );
}

const CSV_COLUMNS = [
  "severity",
  "priority",
  "engine",
  "rule_id",
  "title",
  "file_path",
  "line",
  "explanation",
  "suggested_fix",
  "redacted",
] as const;

/** Quote a CSV field only when it needs it, doubling any embedded quotes. */
function csvCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV, CRLF-terminated so spreadsheet apps read it consistently. */
export function toCsv(findings: ExportableFinding[]): string {
  const rows = findings.map((f) =>
    [
      f.severity,
      f.priority,
      f.engine,
      f.ruleId,
      f.title,
      f.filePath ?? "",
      f.line ?? "",
      f.plainExplanation ?? "",
      f.suggestedFix ?? "",
      f.redacted,
    ]
      .map(csvCell)
      .join(","),
  );
  return [CSV_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}

/** e.g. "safeship-octocat-hello-world-2026-08-19.sarif" */
export function exportFilename(scan: ExportScan, extension: string): string {
  const repo = scan.repoFullName.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  const date = scan.createdAt.toISOString().slice(0, 10);
  return `safeship-${repo}-${date}.${extension}`;
}
