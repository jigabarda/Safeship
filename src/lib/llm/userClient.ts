import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { getLlmClient } from "./index";
import { OpenAiCompatibleClient } from "./openaiCompatible";
import type { LlmClient } from "./types";

/**
 * The LLM client for a given user: their own configured model if they've set one
 * ("bring your own model"), otherwise Safeship's built-in default. Never throws —
 * a bad/undecryptable config falls back to the default.
 */
export async function getUserLlmClient(userId: string): Promise<LlmClient | null> {
  try {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { llmProvider: true, llmBaseUrl: true, llmModel: true, llmApiKeyEnc: true },
    });
    if (u?.llmBaseUrl && u.llmModel && u.llmApiKeyEnc) {
      const apiKey = decryptSecret(u.llmApiKeyEnc);
      return new OpenAiCompatibleClient({
        name: u.llmProvider || "custom",
        apiKey,
        model: u.llmModel,
        baseUrl: u.llmBaseUrl,
      });
    }
  } catch (e) {
    console.warn(`[llm] per-user client unavailable, using default: ${(e as Error).message}`);
  }
  return getLlmClient();
}
