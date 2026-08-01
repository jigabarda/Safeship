// Turn the Schema review's recommendations into ONE concrete, reviewable change,
// using the correct workflow for the project's framework:
//   prisma  → edit schema.prisma directly
//   sql     → edit the .sql schema file
//   rails   → generate a NEW ActiveRecord migration (never edit schema.rb)
//   unknown → let the model decide the file + kind (best-effort, labeled as such)
//
// The route commits the result on a branch and opens a PR — it's never applied
// to a database and never auto-merged.

import { z } from "zod";
import type { LlmClient } from "@/lib/llm/types";
import type { SchemaSource } from "@/lib/schema/parse";

export type Framework = "prisma" | "sql" | "rails" | "unknown";

export function frameworkFromSource(source: SchemaSource): Framework {
  if (source === "prisma" || source === "sql" || source === "rails") return source;
  return "unknown"; // "mixed" / "none" → let the model decide
}

export const FRAMEWORK_LABEL: Record<Framework, string> = {
  prisma: "Prisma",
  sql: "SQL",
  rails: "Rails",
  unknown: "your stack",
};

export type ChangeKind = "edit" | "create";

export interface SchemaChangePlan {
  canApply: boolean;
  changeKind: ChangeKind;
  /** For "edit": which existing file. For "create": a name/slug or full path. */
  path: string;
  /** For "edit": the entire corrected file. For "create": the new file body. */
  content: string;
  summary: string;
  note: string;
}

const FRAMEWORK_RULES: Record<Framework, string> = {
  prisma: `Framework: Prisma. Set changeKind="edit". Return the ENTIRE corrected schema file as "content" (keep every model, just apply the improvements). In "path" echo the schema file's path.`,
  sql: `Framework: SQL. Set changeKind="edit". Return the ENTIRE corrected .sql schema as "content". In "path" echo the schema file's path.`,
  rails: `Framework: Ruby on Rails. NEVER edit db/schema.rb (it is generated). Set changeKind="create" and return a NEW ActiveRecord migration as "content", using "class <CamelCaseName> < ActiveRecord::Migration[7.1]" with a "change" method. In "path" return ONLY a short snake_case slug (no timestamp, no path, no ".rb") whose CamelCase equals the class name — e.g. "add_unique_index_to_users_email".`,
  unknown: `Framework: unknown. Choose the correct workflow for this project: either changeKind="edit" (return the entire corrected file in "content") or changeKind="create" for a new migration (return the new file body in "content"). In "path" return the full repo-relative path following this framework's real convention.`,
};

function systemPrompt(framework: Framework): string {
  return `You are a senior database engineer applying recommended schema improvements to a project, using the CORRECT workflow for its framework. You are given the current schema file(s) and a list of recommendations.

Produce ONE change a developer can open as a pull request. Apply the highest-value, LOWEST-RISK subset of the recommendations that is safe to do in a single change. STRONGLY prefer additive/safe changes: adding indexes, foreign keys, constraints, sensible defaults, or fixing column types. Do NOT drop tables or columns or otherwise destroy data unless a recommendation explicitly and clearly calls for it.

${FRAMEWORK_RULES[framework]}

If nothing can be applied safely as a single change, set canApply=false and explain why in "note".

Respond with STRICT JSON only (no markdown fences) matching exactly:
{
  "canApply": boolean,
  "changeKind": "edit" | "create",
  "path": string,
  "content": string,
  "summary": string,   // 1-2 sentences for the PR description
  "note": string       // caveats, or why nothing was applied
}`;
}

function buildUserPrompt(
  files: Array<{ path: string; content: string }>,
  recommendations: string,
): string {
  const fileBlocks = files
    .map((f) => `FILE: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");
  return [
    `Current schema files:`,
    "",
    fileBlocks,
    "",
    `Recommendations to apply:`,
    recommendations,
    "",
    `Return the JSON object now.`,
  ].join("\n");
}

const schema = z.object({
  canApply: z.unknown(),
  changeKind: z.unknown(),
  path: z.unknown(),
  content: z.unknown(),
  summary: z.unknown(),
  note: z.unknown(),
});

function extractJson(raw: string): string {
  let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  return s;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Ask the model for a single schema change. Never throws on a weak response —
 * returns canApply=false so the caller degrades gracefully.
 */
export async function planSchemaChange(
  client: LlmClient,
  framework: Framework,
  files: Array<{ path: string; content: string }>,
  recommendations: string,
): Promise<SchemaChangePlan> {
  const raw = await client.complete(
    [
      { role: "system", content: systemPrompt(framework) },
      { role: "user", content: buildUserPrompt(files, recommendations) },
    ],
    { temperature: 0.15, json: true, maxTokens: 4000 },
  );

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(JSON.parse(extractJson(raw)));
  } catch {
    return blank("The AI returned a response that couldn't be parsed.");
  }

  const canApply = parsed.canApply === true;
  const changeKind: ChangeKind = str(parsed.changeKind) === "edit" ? "edit" : "create";
  const path = str(parsed.path).trim();
  const content = str(parsed.content);
  const summary = str(parsed.summary).trim();
  const note = str(parsed.note).trim();

  if (!canApply || !content.trim() || !path) {
    return { canApply: false, changeKind, path, content: "", summary, note: note || "No safe change was produced." };
  }
  return { canApply: true, changeKind, path, content, summary, note };
}

function blank(note: string): SchemaChangePlan {
  return { canApply: false, changeKind: "edit", path: "", content: "", summary: "", note };
}
