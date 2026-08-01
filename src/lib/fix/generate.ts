// Ask the LLM to produce a corrected version of a single file that resolves one
// finding, then validate it enough to trust opening a PR from it.
//
// Unlike the rest of the app, this sends the file's REAL contents to the AI
// provider (a redacted file couldn't be committed back). That's deliberate and
// disclosed in the UI: the whole point is to hand back a committable file.

import { z } from "zod";
import type { LlmClient } from "@/lib/llm/types";

export interface FixInput {
  engine: string;
  ruleId: string;
  severity: string;
  title: string;
  rawMessage: string;
  filePath: string;
  line: number | null;
  fileContent: string;
}

export interface FixResult {
  canFix: boolean;
  summary: string;
  fixedContent: string;
}

/** Files we refuse to auto-fix — lockfiles are generated, not hand-edited. */
const UNFIXABLE_PATHS =
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.ya?ml|composer\.lock|Cargo\.lock|Gemfile\.lock)$/i;

export const MAX_FIX_FILE_BYTES = 24_000;

export function isFixablePath(path: string): boolean {
  return !UNFIXABLE_PATHS.test(path);
}

const SYSTEM_PROMPT = `You are a senior engineer fixing exactly ONE issue in a single source file. You are given the issue and the file's COMPLETE contents.

Return the COMPLETE corrected file with the MINIMAL change that resolves this one issue — change nothing else. Preserve all other code, formatting, comments, and imports exactly as given.

If the issue is a hardcoded secret/credential, remove the literal value and replace it with an environment-variable reference appropriate to the language (e.g. process.env.NAME, os.environ["NAME"]). NEVER invent a real secret value.

If you cannot safely resolve the issue by editing this one file alone (for example, it needs a dependency upgrade or changes across multiple files), set canFix to false and leave fixedContent empty.

Respond with STRICT JSON only (no markdown fences) matching exactly:
{
  "canFix": boolean,
  "summary": string,      // 1-2 sentences describing the change, for a PR description
  "fixedContent": string  // the ENTIRE corrected file; "" if canFix is false
}`;

function buildUserPrompt(input: FixInput): string {
  return [
    `Issue to fix:`,
    `- Engine: ${input.engine}`,
    `- Rule: ${input.ruleId}`,
    `- Severity: ${input.severity}`,
    `- Title: ${input.title}`,
    input.line ? `- Around line: ${input.line}` : "",
    `- Details: ${input.rawMessage}`,
    ``,
    `File: ${input.filePath}`,
    "```",
    input.fileContent,
    "```",
    ``,
    `Return the JSON object now.`,
  ]
    .filter(Boolean)
    .join("\n");
}

const schema = z.object({
  canFix: z.unknown(),
  summary: z.unknown(),
  fixedContent: z.unknown(),
});

function extractJson(raw: string): string {
  let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  return s;
}

/**
 * Generate and sanity-check a fix. Returns canFix=false (never throws on a weak
 * model response) when the output can't be trusted, so the caller degrades to
 * "couldn't auto-fix" instead of committing garbage.
 */
export async function generateFix(client: LlmClient, input: FixInput): Promise<FixResult> {
  const raw = await client.complete(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(input) },
    ],
    { temperature: 0.1, json: true, maxTokens: 4000 },
  );

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(JSON.parse(extractJson(raw)));
  } catch {
    return { canFix: false, summary: "", fixedContent: "" };
  }

  const canFix = parsed.canFix === true;
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const fixedContent = typeof parsed.fixedContent === "string" ? parsed.fixedContent : "";

  if (!canFix || !fixedContent.trim()) {
    return { canFix: false, summary, fixedContent: "" };
  }

  // Guard against a truncated or wholesale-rewritten file: the fix should be a
  // near-complete copy of the original. Reject anything that lost most of the
  // file or is identical (no actual change).
  const original = input.fileContent;
  if (fixedContent.trim() === original.trim()) {
    return { canFix: false, summary, fixedContent: "" };
  }
  if (fixedContent.length < original.length * 0.5) {
    return { canFix: false, summary, fixedContent: "" };
  }

  return { canFix: true, summary, fixedContent };
}
