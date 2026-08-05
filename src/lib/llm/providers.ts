// OpenAI-compatible provider presets for "bring your own model". Each preset just
// fills in a base URL; the user supplies a model name and API key. Pure data, so
// it's safe to import in both the client form and server routes.

export interface LlmPreset {
  id: string;
  label: string;
  baseUrl: string;
  exampleModel: string;
}

export const LLM_PRESETS: LlmPreset[] = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", exampleModel: "gpt-4o-mini" },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", exampleModel: "llama-3.3-70b-versatile" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", exampleModel: "openai/gpt-4o-mini" },
  { id: "together", label: "Together", baseUrl: "https://api.together.xyz/v1", exampleModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  { id: "custom", label: "Custom (OpenAI-compatible)", baseUrl: "", exampleModel: "" },
];

export function isValidBaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
