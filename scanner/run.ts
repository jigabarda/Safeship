/**
 * Standalone engine scan — the same core the in-process pipeline uses, exposed
 * as a CLI so a GitHub Actions runner can execute it (Phase C).
 *
 * It clones a repo (or copies a local dir), runs gitleaks/osv/semgrep, redacts
 * secrets, and prints a REDACTED EngineScanResult as JSON on stdout. No database,
 * no LLM, no secret values in the output.
 *
 * Usage:
 *   node --env-file=.env --import tsx scanner/run.ts --repo <httpsUrl> [--token <ghToken>]
 *   node --import tsx scanner/run.ts --source-dir <localDir>
 *
 * Exit codes: 0 ok · 1 scan failed · 2 bad arguments.
 */
import { runEngineScan } from "../src/lib/scan/engineScan";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const repoUrl = arg("repo");
  const token = arg("token") ?? process.env.GITHUB_SCAN_TOKEN;
  const sourceDir = arg("source-dir");

  if (!repoUrl && !sourceDir) {
    console.error(
      "Usage: scanner/run.ts --repo <httpsUrl> [--token <ghToken>] | --source-dir <localDir>",
    );
    process.exit(2);
  }

  const result = await runEngineScan({
    repoUrl,
    token,
    sourceDirOverride: sourceDir,
  });

  // Machine-readable result to stdout; human progress to stderr.
  console.error(
    `[scanner] ${result.findings.length} finding(s); missing engines: ${
      result.missing.length ? result.missing.join(", ") : "none"
    }`,
  );
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main().catch((e) => {
  console.error(`[scanner] failed: ${(e as Error)?.message ?? e}`);
  process.exit(1);
});
