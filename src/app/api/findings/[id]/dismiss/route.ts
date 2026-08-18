import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  addIgnoreRule,
  isIgnoreReason,
  removeIgnoreRule,
  syncFindingsToRule,
  type IgnoreReason,
  type RuleTarget,
} from "@/lib/scan/ignoreRules";

// Dismiss a finding (false positive / accepted risk / won't fix) or restore it.
// Owner-only. Dismissing writes a repo-scoped ignore rule so the decision sticks
// on future scans; restoring revokes that rule so the finding comes back. Either
// way the change is applied to every stored finding that matches, so all of the
// repo's reports agree.

interface Body {
  dismissed?: boolean;
  reason?: string;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const finding = await db.finding.findUnique({ where: { id }, include: { scan: true } });
  if (!finding || finding.scan.userId !== session.user.id) {
    return Response.json({ error: "Finding not found" }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const dismissed = Boolean(body.dismissed);
  const reason: IgnoreReason | null = dismissed
    ? isIgnoreReason(body.reason)
      ? body.reason
      : "false_positive"
    : null;

  const target: RuleTarget = {
    userId: finding.scan.userId,
    repoFullName: finding.scan.repoFullName,
    engine: finding.engine,
    ruleId: finding.ruleId,
    filePath: finding.filePath,
  };

  if (dismissed && reason) {
    await addIgnoreRule(target, reason, {
      title: finding.title,
      severity: finding.severity,
    });
  } else {
    await removeIgnoreRule(target);
  }
  await syncFindingsToRule(target, dismissed, reason);

  return Response.json({ ok: true, dismissed, dismissReason: reason });
}
