// Normalized shapes shared by every engine wrapper.
// These are *pre-LLM* findings — the LLM layer (§7) enriches them later with
// plain-language explanations, fixes, and a priority.

export type Severity = "critical" | "high" | "medium" | "low";

export type EngineName = "gitleaks" | "semgrep" | "osv";

export interface NormalizedFinding {
  engine: EngineName;
  ruleId: string;
  severity: Severity;
  /** Short, engine-derived title. The LLM rewrites this into plain language. */
  title: string;
  filePath?: string;
  line?: number;
  /** The engine's original human-readable message. */
  rawMessage: string;
  /**
   * If the finding exposed a secret value (gitleaks), the raw value goes here so
   * the pipeline can redact it before storage/LLM. NEVER persist this field.
   */
  secretValue?: string;
}

export interface EngineResult {
  engine: EngineName;
  /** false when the engine binary is not installed / not found. */
  available: boolean;
  findings: NormalizedFinding[];
  /** Non-fatal problem (e.g. binary missing, parse error). Not thrown. */
  error?: string;
  durationMs: number;
}
