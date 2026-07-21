import { auth } from "@/auth";
import { db } from "@/lib/db";
import { cancelScanWorkflow } from "@/lib/scan/cancel";

// Stop a scan the user no longer wants. Marks the scan cancelled (a terminal
// state the callback refuses to overwrite) and asks GitHub to abort the runner.

export async function POST(
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

  // Already finished (or already cancelled) — nothing to stop.
  if (scan.status !== "queued" && scan.status !== "running") {
    return Response.json({ ok: true, status: scan.status, note: "already finished" });
  }

  // Mark it terminal first, so a callback that lands mid-cancel is ignored.
  await db.scan.update({
    where: { id: scan.id },
    data: {
      status: "cancelled",
      error: "You stopped this scan.",
      finishedAt: new Date(),
    },
  });

  // Best effort — the row is cancelled either way.
  const abortedRunner = await cancelScanWorkflow(scan.id);

  return Response.json({ ok: true, status: "cancelled", abortedRunner });
}
