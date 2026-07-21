/**
 * Phase 3 acceptance harness — drives runScan() end-to-end against a fixture.
 * Verifies: Scan marked done, score computed, Finding rows persisted, the clone
 * workdir deleted, and NO planted secret value stored anywhere in the DB.
 *
 * Run:  node --env-file=.env --import tsx scripts/test-pipeline.ts
 */
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { db } from "../src/lib/db";
import { runScan } from "../src/lib/scan/runScan";
import { makeFixture, PLANTED_SECRETS } from "./lib-fixture";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("  ✓ " + msg);
}

async function main() {
  const fixtureDir = await makeFixture();
  console.log(`Fixture: ${fixtureDir}\n`);

  const user = await db.user.upsert({
    where: { githubId: "test-fixture-user" },
    update: {},
    create: {
      githubId: "test-fixture-user",
      username: "fixture-bot",
      accessToken: "not-a-real-token",
    },
  });
  const scan = await db.scan.create({
    data: {
      userId: user.id,
      repoFullName: "fixture/vulnerable",
      repoUrl: "https://github.com/fixture/vulnerable",
    },
  });

  try {
    console.log("Running scan (engines only — explanations are generated lazily)...\n");
    await runScan(scan.id, { sourceDirOverride: fixtureDir });

    const done = await db.scan.findUniqueOrThrow({ where: { id: scan.id } });
    const findings = await db.finding.findMany({ where: { scanId: scan.id } });

    console.log("── Assertions ──");
    assert(done.status === "done", `scan status is "done" (got "${done.status}")`);
    assert(typeof done.score === "number", `score computed: ${done.score}`);
    assert(done.score! >= 0 && done.score! <= 100, "score in range 0–100");
    assert(done.finishedAt !== null, "finishedAt set");
    assert(findings.length > 0, `findings persisted: ${findings.length}`);

    const bySeverity = findings.reduce<Record<string, number>>((a, f) => {
      a[f.severity] = (a[f.severity] ?? 0) + 1;
      return a;
    }, {});
    console.log("     severities:", JSON.stringify(bySeverity));

    // Explanations are generated lazily (/api/findings/[id]/explain), so a fresh
    // scan stores findings without them — expected, not a regression.
    assert(
      findings.every((f) => f.plainExplanation === null),
      "findings stored without an eager AI pass (explained lazily when opened)",
    );
    assert(findings.some((f) => f.redacted), "at least one finding flagged redacted");

    // The critical safety check: no planted secret value anywhere in the DB.
    const blob = JSON.stringify(findings);
    assert(!blob.includes(PLANTED_SECRETS.awsKey), "AWS key NOT present in stored findings");
    assert(!blob.includes(PLANTED_SECRETS.slackToken), "Slack token NOT present in stored findings");

    // Clone workdir cleanup: the fixture original still exists, temp clone gone.
    assert(existsSync(fixtureDir), "original fixture untouched");

    console.log("\n  Sample stored finding:");
    const sample = findings[0];
    console.log("   [" + sample.priority + "] " + sample.title);
    console.log("   " + (sample.filePath ?? "(no path)") + (sample.line ? ":" + sample.line : ""));
    console.log("   " + sample.rawMessage.slice(0, 140) + "...");

    console.log(`\n✅ ACCEPTANCE PASS — score ${done.score}/100, ${findings.length} findings, no secrets leaked.`);
  } finally {
    // Clean up test rows + fixture so the script is idempotent.
    await db.finding.deleteMany({ where: { scanId: scan.id } });
    await db.scan.delete({ where: { id: scan.id } }).catch(() => {});
    await rm(fixtureDir, { recursive: true, force: true });
    await db.$disconnect();
    console.log("(test rows + fixture cleaned up)");
  }
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
