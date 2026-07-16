import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ScanReport, type ScanData } from "@/components/ScanReport";
import { byPriorityThenSeverity } from "@/lib/scan/ordering";

export default async function ScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/dashboard");

  const scan = await db.scan.findUnique({
    where: { id },
    include: { findings: true },
  });
  if (!scan || scan.userId !== session.user.id) notFound();

  const findings = [...scan.findings].sort(byPriorityThenSeverity);

  const initial: ScanData = {
    id: scan.id,
    repoFullName: scan.repoFullName,
    status: scan.status,
    score: scan.score,
    error: scan.error,
    createdAt: scan.createdAt.toISOString(),
    finishedAt: scan.finishedAt ? scan.finishedAt.toISOString() : null,
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
  };

  return <ScanReport scanId={id} initial={initial} />;
}
