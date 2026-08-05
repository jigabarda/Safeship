import { auth } from "@/auth";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { isValidBaseUrl } from "@/lib/llm/providers";
import { OpenAiCompatibleClient } from "@/lib/llm/openaiCompatible";

// A user's library of OpenAI-compatible models. Keys are verified with a tiny
// live call, then stored encrypted and never returned.

interface Body {
  label?: string;
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Not signed in" }, { status: 401 });

  const models = await db.llmModel.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true, provider: true, baseUrl: true, model: true },
  });
  return Response.json({ models });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Not signed in" }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const label = (body.label ?? "").trim().slice(0, 40);
  const provider = (body.provider ?? "custom").trim().slice(0, 40) || "custom";
  const baseUrl = (body.baseUrl ?? "").trim();
  const model = (body.model ?? "").trim().slice(0, 120);
  const apiKey = (body.apiKey ?? "").trim();

  if (!label) return Response.json({ error: "Give this model a name." }, { status: 400 });
  if (!isValidBaseUrl(baseUrl)) {
    return Response.json({ error: "Enter a valid base URL (https://…)." }, { status: 400 });
  }
  if (!model) return Response.json({ error: "Enter a model name." }, { status: 400 });
  if (!apiKey) return Response.json({ error: "Enter an API key." }, { status: 400 });

  // Verify it works before saving.
  try {
    const client = new OpenAiCompatibleClient({ name: label, apiKey, model, baseUrl });
    await client.complete([{ role: "user", content: "Reply with the single word: OK" }], {
      maxTokens: 5,
      temperature: 0,
    });
  } catch (e) {
    return Response.json(
      { error: `Couldn't reach that model: ${(e as Error).message.slice(0, 180)}` },
      { status: 400 },
    );
  }

  const created = await db.llmModel.create({
    data: { userId: session.user.id, label, provider, baseUrl, model, apiKeyEnc: encryptSecret(apiKey) },
    select: { id: true, label: true, provider: true, baseUrl: true, model: true },
  });
  return Response.json({ model: created });
}
