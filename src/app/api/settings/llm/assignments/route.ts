import { auth } from "@/auth";
import { db } from "@/lib/db";
import { FEATURE_COLUMN, LLM_FEATURES, type LlmFeature } from "@/lib/llm/features";

// Set which model each feature uses. Body maps feature -> modelId | null
// (null = Safeship's default). Unlisted features are left unchanged.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Not signed in" }, { status: 401 });
  const userId = session.user.id;

  let body: Partial<Record<LlmFeature, string | null>>;
  try {
    body = (await request.json()) as Partial<Record<LlmFeature, string | null>>;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Collect the model ids being assigned, and validate they belong to the user.
  const ids = new Set<string>();
  for (const f of LLM_FEATURES) {
    const v = body[f.key];
    if (typeof v === "string" && v) ids.add(v);
  }
  if (ids.size > 0) {
    const owned = await db.llmModel.findMany({
      where: { userId, id: { in: [...ids] } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((m) => m.id));
    for (const id of ids) {
      if (!ownedIds.has(id)) {
        return Response.json({ error: "Unknown model selected." }, { status: 400 });
      }
    }
  }

  const data: Record<string, string | null> = {};
  for (const f of LLM_FEATURES) {
    if (f.key in body) {
      const v = body[f.key];
      data[FEATURE_COLUMN[f.key]] = typeof v === "string" && v ? v : null;
    }
  }
  if (Object.keys(data).length > 0) {
    await db.user.update({ where: { id: userId }, data });
  }
  return Response.json({ ok: true });
}
