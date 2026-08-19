import { auth } from "@/auth";
import { db } from "@/lib/db";
import { byPriorityThenSeverity } from "@/lib/scan/ordering";
import { exportFilename, toCsv, toSarif } from "@/lib/scan/export";

// Download a finished scan's findings as SARIF (for GitHub code scanning and
// other security tooling) or CSV (for spreadsheets and ticket trackers).
// Owner-only, and active findings only — an ignored finding is a decision the
// user already made, so exporting it would re-import work they closed.

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const scan = await db.scan.findUnique({
    where: { id },
    include: { findings: { where: { dismissed: false } } },
  });
  if (!scan || scan.userId !== session.user.id) {
    return Response.json({ error: "Scan not found" }, { status: 404 });
  }
  if (scan.status !== "done") {
    return Response.json({ error: "Scan is not finished" }, { status: 409 });
  }

  const format = new URL(request.url).searchParams.get("format") ?? "sarif";
  if (format !== "sarif" && format !== "csv") {
    return Response.json({ error: "Unsupported format" }, { status: 400 });
  }

  const findings = [...scan.findings].sort(byPriorityThenSeverity);
  const meta = {
    id: scan.id,
    repoFullName: scan.repoFullName,
    score: scan.score,
    createdAt: scan.createdAt,
  };

  const body = format === "sarif" ? toSarif(meta, findings) : toCsv(findings);
  const extension = format === "sarif" ? "sarif" : "csv";
  const contentType =
    format === "sarif" ? "application/sarif+json; charset=utf-8" : "text/csv; charset=utf-8";

  return new Response(body, {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${exportFilename(meta, extension)}"`,
      // A report is per-scan and immutable once done, but it is also private.
      "cache-control": "private, no-store",
    },
  });
}
