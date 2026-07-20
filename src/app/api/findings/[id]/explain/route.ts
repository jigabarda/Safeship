import { auth } from "@/auth";
import type { Severity } from "@/lib/engines/types";
import { db } from "@/lib/db";
import { explainFindingSafe, getLlmClient } from "@/lib/llm/index";

// Lazily generate a plain-English explanation + suggested fix for a single
// finding, the first time a user opens it. The result is cached on the Finding
// row so it's only ever generated once. Owner-only.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const finding = await db.finding.findUnique({
    where: { id },
    include: { scan: true },
  });
  if (!finding || finding.scan.userId !== session.user.id) {
    return Response.json({ error: "Finding not found" }, { status: 404 });
  }

  // Already explained — return the cached text (idempotent).
  if (finding.plainExplanation) {
    return Response.json({
      plainExplanation: finding.plainExplanation,
      suggestedFix: finding.suggestedFix ?? "",
    });
  }

  const llm = getLlmClient();
  const { output } = await explainFindingSafe(
    {
      engine: finding.engine,
      ruleId: finding.ruleId,
      rawMessage: finding.rawMessage,
      severity: finding.severity as Severity,
    },
    llm,
  );

  await db.finding.update({
    where: { id },
    data: {
      plainExplanation: output.plainExplanation,
      suggestedFix: output.suggestedFix,
    },
  });

  return Response.json({
    plainExplanation: output.plainExplanation,
    suggestedFix: output.suggestedFix,
  });
}
