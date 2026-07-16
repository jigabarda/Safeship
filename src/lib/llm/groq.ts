import { buildUserPrompt, parseExplain, SYSTEM_PROMPT } from "./prompt";
import type { ExplainInput, ExplainOutput, LlmClient } from "./types";

/**
 * Groq free API — OpenAI-compatible, fast, no credit card. Good default when
 * the app is deployed (where a local Ollama isn't reachable). Requires
 * GROQ_API_KEY (free from https://console.groq.com/keys).
 */
export class GroqClient implements LlmClient {
  readonly name = "groq";
  private apiKey: string;
  private model: string;
  private baseUrl = "https://api.groq.com/openai/v1";

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY ?? "";
    this.model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
    if (!this.apiKey) {
      throw new Error("GROQ_API_KEY is not set");
    }
  }

  async explainFinding(input: ExplainInput): Promise<ExplainOutput> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(input) },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Groq HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Groq returned an empty response");
    return parseExplain(content, input);
  }
}
