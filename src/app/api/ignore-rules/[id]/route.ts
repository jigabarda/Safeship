import { auth } from "@/auth";
import { db } from "@/lib/db";
import { syncFindingsToRule } from "@/lib/scan/ignoreRules";

// Revoke an ignore rule. The finding starts being reported again — both on the
// repo's existing scan reports and on every scan from here on. Owner-only.

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const rule = await db.ignoreRule.findUnique({ where: { id } });
  if (!rule || rule.userId !== session.user.id) {
    return Response.json({ error: "Rule not found" }, { status: 404 });
  }

  await db.ignoreRule.delete({ where: { id } });
  await syncFindingsToRule(
    {
      userId: rule.userId,
      repoFullName: rule.repoFullName,
      engine: rule.engine,
      ruleId: rule.ruleId,
      // Rules store "" for "no file"; findings store null.
      filePath: rule.filePath === "" ? null : rule.filePath,
    },
    false,
    null,
  );

  return Response.json({ ok: true, revoked: id });
}
