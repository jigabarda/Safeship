// The AI features a user can independently point at a model. Pure data — safe to
// import in the client settings UI and in server routes alike.

export const LLM_FEATURES = [
  { key: "explain", label: "Finding explanations", desc: "Plain-English explanations of scan findings." },
  { key: "advisor", label: "Advisor", desc: "Schema, stack, and optimization reviews." },
  { key: "assistant", label: "Assistant", desc: "The in-app chat assistant." },
  { key: "fix", label: "Fix generation", desc: "Generating code fixes and pull requests." },
] as const;

export type LlmFeature = (typeof LLM_FEATURES)[number]["key"];

/** DB column on User holding each feature's assigned model id. */
export const FEATURE_COLUMN = {
  explain: "explainModelId",
  advisor: "advisorModelId",
  assistant: "assistantModelId",
  fix: "fixModelId",
} as const satisfies Record<LlmFeature, string>;

export function isLlmFeature(v: unknown): v is LlmFeature {
  return typeof v === "string" && LLM_FEATURES.some((f) => f.key === v);
}
