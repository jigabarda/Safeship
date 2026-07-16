import { GroqClient } from "./groq";
import { OllamaClient } from "./ollama";
import { fallbackPriority } from "./prompt";
import type { ExplainInput, ExplainOutput, LlmClient } from "./types";

export * from "./types";
export { redactText } from "./redact";

/**
 * Build the configured LLM client. Returns null (never throws) when no provider
 * is configured/available so the scan pipeline can degrade gracefully.
 */
export function getLlmClient(): LlmClient | null {
  const provider = (process.env.LLM_PROVIDER ?? "ollama").toLowerCase();
  try {
    switch (provider) {
      case "ollama":
        return new OllamaClient();
      case "groq":
        return new GroqClient();
      default:
        console.warn(`[llm] Unknown LLM_PROVIDER "${provider}" — AI explanations disabled.`);
        return null;
    }
  } catch (e) {
    console.warn(`[llm] Provider "${provider}" unavailable: ${(e as Error).message}`);
    return null;
  }
}

/** The plain, non-AI fallback for a finding when no LLM is available/working. */
export function fallbackExplanation(input: ExplainInput): ExplainOutput {
  return {
    title: input.rawMessage.split("\n")[0].slice(0, 80) || input.ruleId,
    plainExplanation:
      `${input.rawMessage}\n\n(AI explanation unavailable — showing the security engine's original message.)`,
    suggestedFix:
      "No AI-generated fix is available right now. Review the engine's message above, or configure an LLM provider (see README) to get plain-language fixes.",
    priority: fallbackPriority(input.severity),
  };
}

/**
 * Explain a finding, never throwing. On any LLM failure it returns the plain
 * fallback so a scan is never blocked by the AI layer.
 */
export async function explainFindingSafe(
  input: ExplainInput,
  client: LlmClient | null,
): Promise<{ output: ExplainOutput; usedLlm: boolean }> {
  if (!client) return { output: fallbackExplanation(input), usedLlm: false };
  try {
    const output = await client.explainFinding(input);
    return { output, usedLlm: true };
  } catch (e) {
    console.warn(`[llm] explainFinding failed (${client.name}): ${(e as Error).message}`);
    return { output: fallbackExplanation(input), usedLlm: false };
  }
}
