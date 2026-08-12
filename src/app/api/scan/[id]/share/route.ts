import crypto from "crypto";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// Opt-in read-only sharing for a scan report. The owner mints an unguessable
// token (POST) that anyone with the link can use to view a safe, redacted
// report, and can revoke it (DELETE). Nothing is public until the owner opts in.

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
  if (scan.status !== "done") {
    return Response.json(
      { error: "Only a finished scan can be shared." },
      { status: 422 },
    );
  }

  // Reuse the existing token if already shared, so the link is stable.
  const token = scan.shareToken ?? crypto.randomBytes(16).toString("hex");
  if (!scan.shareToken) {
    await db.scan.update({
      where: { id },
      data: { shareToken: token, sharedAt: new Date() },
    });
  }

  return Response.json({ token, path: `/share/${token}` });
}

export async function DELETE(
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

  await db.scan.update({
    where: { id },
    data: { shareToken: null, sharedAt: null },
  });
  return Response.json({ ok: true });
}
