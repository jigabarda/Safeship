import { auth } from "@/auth";
import { db } from "@/lib/db";
import { byPriorityThenSeverity } from "@/lib/scan/ordering";
import { parseScanSteps } from "@/lib/scan/steps";

/** Return a scan's status, score, and findings (owner-only). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const scan = await db.scan.findUnique({ where: { id } });

  if (!scan || scan.userId !== session.user.id) {
    return Response.json({ error: "Scan not found" }, { status: 404 });
  }

  // While a scan is still running the client renders only status + progress, so
  // skip the expensive findings query on every poll — that's the hot path.
  const rows =
    scan.status === "done"
      ? await db.finding.findMany({ where: { scanId: scan.id } })
      : [];
  const findings = [...rows].sort(byPriorityThenSeverity);

  return Response.json({
    id: scan.id,
    repoFullName: scan.repoFullName,
    status: scan.status,
    score: scan.score,
    error: scan.error,
    createdAt: scan.createdAt,
    finishedAt: scan.finishedAt,
    steps: parseScanSteps(scan.steps),
    findings: findings.map((f) => ({
      id: f.id,
      engine: f.engine,
      ruleId: f.ruleId,
      severity: f.severity,
      priority: f.priority,
      title: f.title,
      filePath: f.filePath,
      line: f.line,
      rawMessage: f.rawMessage,
      plainExplanation: f.plainExplanation,
      suggestedFix: f.suggestedFix,
      redacted: f.redacted,
    })),
  });
}
