import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Severity } from "@/lib/engines/types";
import { computeScore } from "@/lib/scan/score";

// Receives REDACTED findings from the GitHub Actions runner and persists them.
// Authenticated with a shared secret (SCAN_CALLBACK_SECRET) that the runner sends
// in the x-safeship-secret header. No LLM here — plain-language explanations are
// added lazily when a finding is opened (Phase F).

const findingSchema = z.object({
  engine: z.enum(["gitleaks", "semgrep", "osv"]),
  ruleId: z.string(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  title: z.string(),
  filePath: z.string().nullable(),
  line: z.number().int().nullable(),
  rawMessage: z.string(),
  redacted: z.boolean(),
});

const payloadSchema = z.object({
  scanId: z.string().min(1),
  findings: z.array(findingSchema),
});

function fallbackPriority(sev: Severity): "fix_now" | "should_fix" | "minor" {
  if (sev === "critical" || sev === "high") return "fix_now";
  if (sev === "medium") return "should_fix";
  return "minor";
}

/** Constant-time secret comparison. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.SCAN_CALLBACK_SECRET;
  if (!secret) {
    console.error("[callback] SCAN_CALLBACK_SECRET not configured");
    return Response.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const provided = request.headers.get("x-safeship-secret") ?? "";
  if (!secretMatches(provided, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = payloadSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const scan = await db.scan.findUnique({ where: { id: parsed.scanId } });
  if (!scan) {
    return Response.json({ error: "Scan not found" }, { status: 404 });
  }
  // Idempotent: a duplicate callback for an already-finished scan is a no-op.
  if (scan.status === "done") {
    return Response.json({ ok: true, note: "already done" });
  }

  if (parsed.findings.length > 0) {
    await db.finding.createMany({
      data: parsed.findings.map((f) => ({
        scanId: scan.id,
        engine: f.engine,
        ruleId: f.ruleId,
        severity: f.severity,
        priority: fallbackPriority(f.severity),
        title: f.title,
        filePath: f.filePath,
        line: f.line,
        rawMessage: f.rawMessage,
        plainExplanation: null,
        suggestedFix: null,
        redacted: f.redacted,
      })),
    });
  }

  const score = computeScore(parsed.findings.map((f) => f.severity));
  await db.scan.update({
    where: { id: scan.id },
    data: { status: "done", score, finishedAt: new Date() },
  });

  return Response.json({ ok: true, findings: parsed.findings.length, score });
}
