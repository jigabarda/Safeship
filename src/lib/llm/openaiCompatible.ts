import { buildUserPrompt, parseExplain, SYSTEM_PROMPT } from "./prompt";
import { readLines } from "./stream";
import {
  LlmRateLimitError,
  type ChatMessage,
  type CompleteOptions,
  type ExplainInput,
  type ExplainOutput,
  type LlmClient,
} from "./types";

/**
 * A generic OpenAI-compatible chat client (chat/completions + SSE streaming).
 * Works with OpenAI, Groq, OpenRouter, Together, a local Ollama's /v1 endpoint,
 * and anything else that speaks the same API. Used for "bring your own model":
 * the base URL, model, and key all come from the user's settings.
 */
export class OpenAiCompatibleClient implements LlmClient {
  readonly name: string;
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(cfg: { name: string; apiKey: string; model: string; baseUrl: string }) {
    this.name = cfg.name || "custom";
    this.apiKey = cfg.apiKey;
    this.model = cfg.model;
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, "");
    if (!this.baseUrl) throw new Error("A base URL is required");
    if (!this.model) throw new Error("A model is required");
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`;
    return h;
  }

  private async post(body: unknown): Promise<Response> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (res.status === 429) throw new LlmRateLimitError();
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${this.name} HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return res;
  }

  async explainFinding(input: ExplainInput): Promise<ExplainOutput> {
    const res = await this.post({
      model: this.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
    });
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error(`${this.name} returned an empty response`);
    return parseExplain(content, input);
  }

  async complete(messages: ChatMessage[], opts: CompleteOptions = {}): Promise<string> {
    const res = await this.post({
      model: this.model,
      temperature: opts.temperature ?? 0.3,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      messages,
    });
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error(`${this.name} returned an empty response`);
    return content;
  }

  async *stream(messages: ChatMessage[], opts: CompleteOptions = {}): AsyncIterable<string> {
    const res = await this.post({
      model: this.model,
      temperature: opts.temperature ?? 0.3,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      stream: true,
      messages,
    });
    if (!res.body) throw new Error(`${this.name} returned no stream`);

    for await (const line of readLines(res.body)) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
        const chunk = json.choices?.[0]?.delta?.content;
        if (chunk) yield chunk;
      } catch {
        /* ignore keep-alive / partial lines */
      }
    }
  }
}
