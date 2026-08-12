import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { StaticScanReport } from "@/components/StaticScanReport";
import { byPriorityThenSeverity } from "@/lib/scan/ordering";

// Public, read-only shared report. No auth: anyone with the unguessable token
// can view it, because the owner opted in. Only reachable via a token that
// matches a scan the owner explicitly shared; revoking clears the token.

export default async function SharedScanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // A token is only ever set on a finished scan the owner chose to share.
  const scan = await db.scan.findUnique({
    where: { shareToken: token },
    include: { findings: true },
  });
  if (!scan || scan.status !== "done") notFound();

  const findings = scan.findings
    .filter((f) => !f.dismissed)
    .sort(byPriorityThenSeverity);

  return (
    <main className="animate-in mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <StaticScanReport
        repoFullName={scan.repoFullName}
        score={scan.score}
        scannedAtIso={scan.createdAt.toISOString()}
        findings={findings}
      />

      <footer className="border-t border-line pt-4 text-xs text-muted">
        Shared read-only via <span className="font-medium">Safeship</span>. This link can be
        revoked by its owner.
      </footer>
    </main>
  );
}
