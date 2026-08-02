import { auth } from "@/auth";
import { db } from "@/lib/db";
import { encryptSecret, decryptSecret, maskKey } from "@/lib/crypto";
import { isValidBaseUrl } from "@/lib/llm/providers";
import { OpenAiCompatibleClient } from "@/lib/llm/openaiCompatible";

// Save / test / remove a user's "bring your own model" config. The API key is
// verified with a tiny live call, then stored encrypted. It is never returned.

interface Body {
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Not signed in" }, { status: 401 });
  const userId = session.user.id;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const provider = (body.provider ?? "custom").trim().slice(0, 40) || "custom";
  const baseUrl = (body.baseUrl ?? "").trim();
  const model = (body.model ?? "").trim().slice(0, 120);
  const apiKeyInput = (body.apiKey ?? "").trim();

  if (!isValidBaseUrl(baseUrl)) {
    return Response.json({ error: "Enter a valid base URL (https://…)." }, { status: 400 });
  }
  if (!model) {
    return Response.json({ error: "Enter a model name." }, { status: 400 });
  }

  // Use the new key if provided, otherwise keep the existing one.
  let plainKey: string;
  if (apiKeyInput) {
    plainKey = apiKeyInput;
  } else {
    const existing = await db.user.findUnique({
      where: { id: userId },
      select: { llmApiKeyEnc: true },
    });
    if (!existing?.llmApiKeyEnc) {
      return Response.json({ error: "An API key is required." }, { status: 400 });
    }
    try {
      plainKey = decryptSecret(existing.llmApiKeyEnc);
    } catch {
      return Response.json({ error: "Stored key is unreadable — please re-enter it." }, { status: 400 });
    }
  }

  // Verify the config actually works before saving it.
  try {
    const client = new OpenAiCompatibleClient({ name: provider, apiKey: plainKey, model, baseUrl });
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

  await db.user.update({
    where: { id: userId },
    data: {
      llmProvider: provider,
      llmBaseUrl: baseUrl,
      llmModel: model,
      llmApiKeyEnc: encryptSecret(plainKey),
    },
  });

  return Response.json({ ok: true, provider, model, baseUrl, keyMask: maskKey(plainKey) });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Not signed in" }, { status: 401 });

  await db.user.update({
    where: { id: session.user.id },
    data: { llmProvider: null, llmBaseUrl: null, llmModel: null, llmApiKeyEnc: null },
  });
  return Response.json({ ok: true });
}
