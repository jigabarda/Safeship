/**
 * Phase 1 acceptance harness.
 *
 * Generates a throwaway fixture (leaked-credentials file + a package-lock.json
 * pinning a known-vulnerable lodash), runs every engine over it, and prints the
 * normalized findings. The fixture's fake secrets are assembled at runtime in
 * lib-fixture.ts (no token literals live in this repo).
 *
 * Run with:  node --env-file=.env --import tsx scripts/test-scan.ts
 */
import { rm } from "node:fs/promises";
import { runAllEngines } from "../src/lib/engines/index";
import { makeFixture } from "./lib-fixture";

async function main() {
  const dir = await makeFixture();
  console.log(`Fixture created at: ${dir}\n`);

  try {
    const { results, missing } = await runAllEngines(dir);

    for (const r of results) {
      const head = `── ${r.engine.toUpperCase()} ` + "─".repeat(24);
      console.log(head);
      if (!r.available) {
        console.log(`  ⚠ not installed — ${r.error}\n`);
        continue;
      }
      console.log(
        `  available ✓   findings: ${r.findings.length}   (${r.durationMs} ms)`,
      );
      if (r.error) console.log(`  note: ${r.error}`);
      for (const f of r.findings) {
        const loc = f.filePath
          ? `${f.filePath}${f.line ? `:${f.line}` : ""}`
          : "(no location)";
        const secret = f.secretValue ? "  [HAS SECRET VALUE → will be redacted]" : "";
        console.log(`   • [${f.severity}] ${f.title}`);
        console.log(`       ${loc}${secret}`);
      }
      console.log("");
    }

    const byEngine = Object.fromEntries(
      results.map((r) => [r.engine, r.findings.length]),
    );
    console.log("Summary:", JSON.stringify(byEngine));
    if (missing.length) console.log("Missing engines:", missing.join(", "));

    const gitleaksOk = (byEngine["gitleaks"] ?? 0) > 0;
    const osvOk = (byEngine["osv"] ?? 0) > 0;
    if (gitleaksOk && osvOk) {
      console.log("\n✅ ACCEPTANCE PASS: gitleaks and osv-scanner both produced findings.");
    } else {
      console.log(
        `\n❌ ACCEPTANCE INCOMPLETE: gitleaks=${gitleaksOk} osv=${osvOk} (need both > 0).`,
      );
      process.exitCode = 1;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
    console.log(`\nFixture cleaned up.`);
  }
}

main().catch((e) => {
  console.error("test-scan failed:", e);
  process.exit(1);
});
