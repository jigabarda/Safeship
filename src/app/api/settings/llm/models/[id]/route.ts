import { auth } from "@/auth";
import { db } from "@/lib/db";
import { FEATURE_COLUMN } from "@/lib/llm/features";

// Delete a saved model and clear any feature that was pointing at it (those
// features revert to Safeship's default).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Not signed in" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;
  const model = await db.llmModel.findUnique({ where: { id } });
  if (!model || model.userId !== userId) {
    return Response.json({ error: "Model not found" }, { status: 404 });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      explainModelId: true,
      advisorModelId: true,
      assistantModelId: true,
      fixModelId: true,
    },
  });
  const clear: Record<string, null> = {};
  for (const col of Object.values(FEATURE_COLUMN)) {
    if (user && (user as Record<string, string | null>)[col] === id) clear[col] = null;
  }

  await db.llmModel.delete({ where: { id } });
  if (Object.keys(clear).length > 0) {
    await db.user.update({ where: { id: userId }, data: clear });
  }
  return Response.json({ ok: true });
}
