import { auth } from "@/auth";
import { db } from "@/lib/db";
import { byPriorityThenSeverity } from "@/lib/scan/ordering";

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
  const scan = await db.scan.findUnique({
    where: { id },
    include: { findings: true },
  });

  if (!scan || scan.userId !== session.user.id) {
    return Response.json({ error: "Scan not found" }, { status: 404 });
  }

  const findings = [...scan.findings].sort(byPriorityThenSeverity);

  return Response.json({
    id: scan.id,
    repoFullName: scan.repoFullName,
    status: scan.status,
    score: scan.score,
    error: scan.error,
    createdAt: scan.createdAt,
    finishedAt: scan.finishedAt,
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
