import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { ScanReport, type ScanData } from "@/components/ScanReport";
import { byPriorityThenSeverity } from "@/lib/scan/ordering";
import { failScanIfStale, STALE_SCAN_ERROR } from "@/lib/scan/staleScans";
import { parseScanSteps } from "@/lib/scan/steps";
import { getRepoScoreHistory } from "@/lib/scan/history";
import { loadManifest } from "@/lib/fix/dependencies";

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

  // Expire it up front so a dead scan renders as failed instead of spinning.
  if (await failScanIfStale(scan)) {
    scan.status = "failed";
    scan.error = STALE_SCAN_ERROR;
    scan.finishedAt = new Date();
  }

  const findings = [...scan.findings].sort(byPriorityThenSeverity);

  // Prior scores for this repo, so the report can show a "since last scan" delta
  // and a trend sparkline next to the score.
  const priorScores = await getRepoScoreHistory(
    scan.userId,
    scan.repoFullName,
    scan.createdAt,
  );

  // Which packages the repo depends on DIRECTLY. The upgrade action only works
  // for those, so the report needs to know before it offers the button. Failing
  // to read the manifest is not an error — the report just offers no upgrades.
  let directDeps: string[] = [];
  if (scan.status === "done") {
    try {
      const user = await db.user.findUnique({
        where: { id: scan.userId },
        select: { accessToken: true },
      });
      if (user?.accessToken) {
        const manifest = await loadManifest(scan.repoFullName, user.accessToken);
        if (manifest) directDeps = [...manifest.direct.keys()];
      }
    } catch {
      directDeps = [];
    }
  }

  const initial: ScanData = {
    id: scan.id,
    repoFullName: scan.repoFullName,
    status: scan.status,
    score: scan.score,
    error: scan.error,
    createdAt: scan.createdAt.toISOString(),
    finishedAt: scan.finishedAt ? scan.finishedAt.toISOString() : null,
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
  };

  return (
    <>
      <AppHeader
        username={session.user.username ?? session.user.name}
        containerClass="max-w-5xl"
      />
      <ScanReport
        scanId={id}
        initial={initial}
        priorScores={priorScores}
        directDeps={directDeps}
      />
    </>
  );
}
