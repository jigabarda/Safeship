import { z } from "zod";
import type { ExplainInput, ExplainOutput, Priority } from "./types";

export const SYSTEM_PROMPT = `You are Safeship, a friendly security explainer for developers who are NOT security experts (many build with AI tools and have never heard terms like "CVE", "CORS", or "SQL injection").

You are given a single finding produced by a real static-analysis engine. Your job is ONLY to explain and suggest a fix for THIS finding — never invent new problems, and never claim something was exploited. This is static code analysis; nothing was attacked.

Respond with STRICT JSON only (no markdown, no code fences) matching exactly:
{
  "title": string,            // short, plain-language headline (max ~80 chars)
  "plainExplanation": string, // 2-4 sentences a non-expert understands: what it means and why it matters. Define any jargon.
  "suggestedFix": string,     // concrete, actionable fix — a short snippet or numbered steps the user can copy/apply
  "priority": string          // exactly one of: "fix_now", "should_fix", "minor"
}

Priority guidance: "fix_now" = leaked secrets or exploitable high/critical issues; "should_fix" = real but lower-urgency; "minor" = low impact or informational. Be encouraging and concrete. Never include real secret values in your response.`;

export function buildUserPrompt(input: ExplainInput): string {
  const lines = [
    `Engine: ${input.engine}`,
    `Rule ID: ${input.ruleId}`,
    input.severity ? `Detected severity: ${input.severity}` : "",
    `Raw engine message: ${input.rawMessage}`,
  ].filter(Boolean);

  if (input.codeSnippet && input.codeSnippet.trim()) {
    lines.push("", "Relevant code (secrets already redacted):", "```", input.codeSnippet.trim(), "```");
  }
  lines.push("", "Return the JSON object now.");
  return lines.join("\n");
}

// Models (especially small local ones) sometimes return a field as an array of
// steps or a nested object instead of a plain string. Accept anything and
// coerce to a readable string rather than failing the whole finding.
const rawSchema = z.object({
  title: z.unknown(),
  plainExplanation: z.unknown(),
  suggestedFix: z.unknown(),
  priority: z.unknown(),
});

function toStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean).join("\n");
  if (v && typeof v === "object") {
    return Object.values(v as Record<string, unknown>).map(toStr).filter(Boolean).join("\n");
  }
  return v == null ? "" : String(v);
}

function coercePriority(value: string, severity?: ExplainInput["severity"]): Priority {
  const v = value.toLowerCase().replace(/[\s-]+/g, "_");
  if (v.includes("fix_now") || v === "critical" || v === "high") return "fix_now";
  if (v.includes("should")) return "should_fix";
  if (v.includes("minor") || v === "low" || v === "info") return "minor";
  return fallbackPriority(severity);
}

export function fallbackPriority(severity?: ExplainInput["severity"]): Priority {
  if (severity === "critical" || severity === "high") return "fix_now";
  if (severity === "medium") return "should_fix";
  return "minor";
}

/** Strip stray markdown fences and isolate the first JSON object. */
function extractJson(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return s.slice(first, last + 1);
  }
  return s;
}

/** Parse + validate a model response into a well-formed ExplainOutput. */
export function parseExplain(raw: string, input: ExplainInput): ExplainOutput {
  const parsed = rawSchema.parse(JSON.parse(extractJson(raw)));
  const title = toStr(parsed.title).trim();
  const plainExplanation = toStr(parsed.plainExplanation).trim();
  const suggestedFix = toStr(parsed.suggestedFix).trim();
  if (!plainExplanation && !suggestedFix) {
    throw new Error("Model response missing explanation and fix");
  }
  return {
    title: title || input.rawMessage.slice(0, 80),
    plainExplanation,
    suggestedFix,
    priority: coercePriority(toStr(parsed.priority), input.severity),
  };
}
