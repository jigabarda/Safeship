import { auth } from "@/auth";
import { db } from "@/lib/db";

// Dismiss a finding (false positive / accepted risk) or restore it. Owner-only.
const REASONS = new Set(["false_positive", "accepted_risk", "wont_fix"]);

interface Body {
  dismissed?: boolean;
  reason?: string;
}

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const finding = await db.finding.findUnique({ where: { id }, include: { scan: true } });
  if (!finding || finding.scan.userId !== session.user.id) {
    return Response.json({ error: "Finding not found" }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await _request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const dismissed = Boolean(body.dismissed);
  const reason = dismissed
    ? REASONS.has(body.reason ?? "")
      ? (body.reason as string)
      : "false_positive"
    : null;

  await db.finding.update({
    where: { id },
    data: {
      dismissed,
      dismissReason: reason,
      dismissedAt: dismissed ? new Date() : null,
    },
  });

  return Response.json({ ok: true, dismissed, dismissReason: reason });
}
