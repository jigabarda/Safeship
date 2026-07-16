import { buildUserPrompt, parseExplain, SYSTEM_PROMPT } from "./prompt";
import type { ExplainInput, ExplainOutput, LlmClient } from "./types";

/**
 * Fully-local provider. Talks to the Ollama HTTP API (default :11434).
 * Free, private — nothing leaves the machine. Requires `ollama` running and
 * the model pulled (e.g. `ollama pull llama3.2`).
 */
export class OllamaClient implements LlmClient {
  readonly name = "ollama";
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
    this.model = process.env.OLLAMA_MODEL ?? "llama3.2";
  }

  async explainFinding(input: ExplainInput): Promise<ExplainOutput> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: "json", // force JSON output
        options: { temperature: 0.2 },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(input) },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as { message?: { content?: string } };
    const content = data.message?.content;
    if (!content) throw new Error("Ollama returned an empty response");
    return parseExplain(content, input);
  }
}
