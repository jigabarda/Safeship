/**
 * Phase 2 acceptance harness.
 *   1. Redaction scrubs known secrets + credential patterns.
 *   2. explainFinding() returns valid JSON via the configured provider (Ollama).
 *   3. With no LLM, the pipeline falls back gracefully.
 *
 * Run:  node --env-file=.env --import tsx scripts/test-llm.ts
 */
import { redactText } from "../src/lib/llm/redact";
import { explainFindingSafe, getLlmClient } from "../src/lib/llm/index";
import type { ExplainInput } from "../src/lib/llm/types";
import { PLANTED_SECRETS } from "./lib-fixture";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("  ✓ " + msg);
}

async function main() {
  let ok = true;

  // 1) Redaction
  console.log("── Redaction ──");
  const leak = `aws_access_key_id = ${PLANTED_SECRETS.awsKey}\ntoken = ${PLANTED_SECRETS.slackToken}`;
  const { text, redacted } = redactText(leak, [PLANTED_SECRETS.awsKey]);
  assert(redacted, "redaction reported it changed something");
  assert(!text.includes(PLANTED_SECRETS.awsKey), "AWS key value removed");
  assert(text.includes("<REDACTED_SECRET>"), "placeholder inserted");

  // 3) Fallback (no client)
  console.log("\n── Fallback (no LLM) ──");
  const input: ExplainInput = {
    engine: "osv",
    ruleId: "GHSA-35jh-r3h4-6jhm",
    rawMessage: "Command Injection in lodash",
    severity: "high",
  };
  const fb = await explainFindingSafe(input, null);
  assert(!fb.usedLlm, "fallback did not use the LLM");
  assert(fb.output.priority === "fix_now", "high severity → fix_now priority");
  assert(fb.output.suggestedFix.length > 0, "fallback still provides a fix message");

  // 2) Real provider round-trip
  console.log(`\n── Provider round-trip (LLM_PROVIDER=${process.env.LLM_PROVIDER}) ──`);
  const client = getLlmClient();
  if (!client) {
    console.log("  ⚠ No LLM client configured — skipping live round-trip (fallback still works).");
  } else {
    const t0 = Date.now();
    const r = await explainFindingSafe(input, client);
    if (!r.usedLlm) {
      console.log("  ⚠ LLM call failed; used fallback. Check that Ollama is running and the model is pulled.");
      ok = false;
    } else {
      assert(r.output.title.length > 0, "title present");
      assert(r.output.plainExplanation.length > 0, "plainExplanation present");
      assert(r.output.suggestedFix.length > 0, "suggestedFix present");
      assert(["fix_now", "should_fix", "minor"].includes(r.output.priority), "valid priority");
      console.log(`  (${client.name}, ${Date.now() - t0} ms)`);
      console.log("\n  Sample output:");
      console.log("   title:       ", r.output.title);
      console.log("   priority:    ", r.output.priority);
      console.log("   explanation: ", r.output.plainExplanation.slice(0, 160) + "...");
      console.log("   fix:         ", r.output.suggestedFix.slice(0, 160).replace(/\n/g, " ") + "...");
    }
  }

  console.log(ok ? "\n✅ ACCEPTANCE PASS" : "\n❌ ACCEPTANCE INCOMPLETE (LLM round-trip did not succeed)");
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
