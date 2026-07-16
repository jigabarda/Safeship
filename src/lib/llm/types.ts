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

export interface LlmClient {
  readonly name: string;
  explainFinding(input: ExplainInput): Promise<ExplainOutput>;
}
