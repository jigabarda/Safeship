export type Priority = "fix_now" | "should_fix" | "minor";

export interface ExplainInput {
  engine: string;
  ruleId: string;
  rawMessage: string;
  /** Minimal context only — secrets MUST already be redacted before this. */
  codeSnippet?: string;
  /** Normalized severity, used as a hint and for fallback priority. */
  severity?: "critical" | "high" | "medium" | "low";
}

export interface ExplainOutput {
  title: string;
  plainExplanation: string;
  suggestedFix: string;
  priority: Priority;
}

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface CompleteOptions {
  temperature?: number;
  /** Ask the provider for a strict JSON object response. */
  json?: boolean;
  /** Cap the response length (tokens). */
  maxTokens?: number;
}

export interface LlmClient {
  readonly name: string;
  explainFinding(input: ExplainInput): Promise<ExplainOutput>;
  /**
   * Generic chat completion — used by the assistant, advisor, and fix features.
   * Returns the model's raw text (JSON string when opts.json is set).
   */
  complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<string>;
}

/** Thrown when a provider signals it's rate-limited (HTTP 429). */
export class LlmRateLimitError extends Error {
  constructor(message = "The AI provider is rate-limited right now.") {
    super(message);
    this.name = "LlmRateLimitError";
  }
}
