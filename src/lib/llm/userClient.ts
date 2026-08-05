import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { FEATURE_COLUMN, type LlmFeature } from "./features";
import { getLlmClient } from "./index";
import { OpenAiCompatibleClient } from "./openaiCompatible";
import type { LlmClient } from "./types";

/**
 * The LLM client for a given user and feature. If the user has assigned one of
 * their own models to that feature ("bring your own model"), it's used; otherwise
 * Safeship's built-in default. Never throws — a bad/undecryptable model config
 * falls back to the default.
 */
export async function getUserLlmClient(
  userId: string,
  feature: LlmFeature,
): Promise<LlmClient | null> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        explainModelId: true,
        advisorModelId: true,
        assistantModelId: true,
        fixModelId: true,
      },
    });
    const modelId = user?.[FEATURE_COLUMN[feature]];
    if (modelId) {
      const m = await db.llmModel.findUnique({ where: { id: modelId } });
      if (m && m.userId === userId) {
        return new OpenAiCompatibleClient({
          name: m.label,
          apiKey: decryptSecret(m.apiKeyEnc),
          model: m.model,
          baseUrl: m.baseUrl,
        });
      }
    }
  } catch (e) {
    console.warn(`[llm] per-user client unavailable, using default: ${(e as Error).message}`);
  }
  return getLlmClient();
}
