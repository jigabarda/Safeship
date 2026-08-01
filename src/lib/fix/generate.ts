// Ask the LLM to produce a corrected version of a single file that resolves one
// OR MORE findings in that file, then validate it enough to trust opening a PR.
//
// Unlike the rest of the app, this sends the file's REAL contents to the AI
// provider (a redacted file couldn't be committed back). That's deliberate and
// disclosed in the UI: the whole point is to hand back a committable file.

import { z } from "zod";
import type { LlmClient } from "@/lib/llm/types";

/** A single issue to resolve, independent of which file it lives in. */
export interface FixIssue {
  engine: string;
  ruleId: string;
  severity: string;
  title: string;
  rawMessage: string;
  line: number | null;
}

export interface FixInput extends FixIssue {
  filePath: string;
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

function systemPrompt(issueCount: number): string {
  const scope =
    issueCount === 1
      ? "fixing exactly ONE issue in a single source file"
      : `fixing ${issueCount} issues in a single source file`;
  return `You are a senior engineer ${scope}. You are given the issue(s) and the file's COMPLETE contents.

Return the COMPLETE corrected file with the MINIMAL changes that resolve the listed issue(s) — change nothing else. Preserve all other code, formatting, comments, and imports exactly as given.

If an issue is a hardcoded secret/credential, remove the literal value and replace it with an environment-variable reference appropriate to the language (e.g. process.env.NAME, os.environ["NAME"]). NEVER invent a real secret value.

Fix as many of the listed issues as you safely can in this one file. If NONE can be safely resolved by editing this file alone (for example, they need a dependency upgrade or changes across several files), set canFix to false and leave fixedContent empty.

Respond with STRICT JSON only (no markdown fences) matching exactly:
{
  "canFix": boolean,
  "summary": string,      // 1-2 sentences describing what changed, for a PR description
  "fixedContent": string  // the ENTIRE corrected file; "" if canFix is false
}`;
}

function issueLines(issue: FixIssue, index?: number): string {
  const prefix = index === undefined ? "" : `Issue ${index + 1}:\n`;
  return [
    prefix +
      `- Engine: ${issue.engine}`,
    `- Rule: ${issue.ruleId}`,
    `- Severity: ${issue.severity}`,
    `- Title: ${issue.title}`,
    issue.line ? `- Around line: ${issue.line}` : "",
    `- Details: ${issue.rawMessage}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUserPrompt(filePath: string, fileContent: string, issues: FixIssue[]): string {
  const issuesBlock =
    issues.length === 1
      ? `Issue to fix:\n${issueLines(issues[0])}`
      : `Issues to fix (${issues.length}):\n${issues.map((iss, i) => issueLines(iss, i)).join("\n\n")}`;
  return [
    issuesBlock,
    ``,
    `File: ${filePath}`,
    "```",
    fileContent,
    "```",
    ``,
    `Return the JSON object now.`,
  ].join("\n");
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
 * Generate and sanity-check a fix for all `issues` in one file. Returns
 * canFix=false (never throws on a weak model response) when the output can't be
 * trusted, so the caller degrades to "couldn't auto-fix" instead of committing
 * garbage.
 */
export async function generateFileFix(
  client: LlmClient,
  filePath: string,
  fileContent: string,
  issues: FixIssue[],
): Promise<FixResult> {
  const raw = await client.complete(
    [
      { role: "system", content: systemPrompt(issues.length) },
      { role: "user", content: buildUserPrompt(filePath, fileContent, issues) },
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
  if (fixedContent.trim() === fileContent.trim()) {
    return { canFix: false, summary, fixedContent: "" };
  }
  if (fixedContent.length < fileContent.length * 0.5) {
    return { canFix: false, summary, fixedContent: "" };
  }

  return { canFix: true, summary, fixedContent };
}

/** Single-finding convenience wrapper used by the per-finding "Fix" button. */
export async function generateFix(client: LlmClient, input: FixInput): Promise<FixResult> {
  return generateFileFix(client, input.filePath, input.fileContent, [
    {
      engine: input.engine,
      ruleId: input.ruleId,
      severity: input.severity,
      title: input.title,
      rawMessage: input.rawMessage,
      line: input.line,
    },
  ]);
}
