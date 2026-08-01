// The Advisor reads a handful of relevant files from a repo (via the GitHub API,
// using the user's token) and asks the LLM to review them. Three tools:
//   schema   — is the database schema / relationships well-designed?
//   stack    — is the tech stack a good fit; what would you recommend?
//   optimize — structural / dependency / performance cleanups.
//
// Everything sent to the LLM is passed through the same secret-redactor the scan
// pipeline uses, as a safety net. This still sends whole files to the AI
// provider — the UI and README say so plainly.

import { z } from "zod";
import {
  getDefaultBranch,
  getFileContent,
  listRepoTree,
  type RepoTreeEntry,
} from "@/lib/github/repoFiles";
import { redactText } from "@/lib/llm/index";
import { parseSchema, type SchemaModel } from "@/lib/schema/parse";

export type AdvisorTool = "schema" | "stack" | "optimize";

export const ADVISOR_TOOLS: AdvisorTool[] = ["schema", "stack", "optimize"];

export function isAdvisorTool(v: string): v is AdvisorTool {
  return v === "schema" || v === "stack" || v === "optimize";
}

export const ADVISOR_META: Record<
  AdvisorTool,
  { label: string; blurb: string; emptyMessage: string }
> = {
  schema: {
    label: "Schema review",
    blurb: "Checks your database schema and table relationships for good design.",
    emptyMessage:
      "No schema or database files found (looked for .prisma, .sql, migrations, and model folders).",
  },
  stack: {
    label: "Tech-stack advisor",
    blurb: "Reviews your stack and suggests a good fit for what you're building.",
    emptyMessage: "Couldn't find a manifest (package.json, go.mod, requirements.txt, …) to analyze.",
  },
  optimize: {
    label: "Optimization",
    blurb: "Suggests structural, dependency, and performance cleanups.",
    emptyMessage: "Couldn't find enough project files to analyze.",
  },
};

// Budgets that keep us well within free-tier token limits.
const MAX_FILES = 12;
const MAX_TOTAL_BYTES = 48_000;
const MAX_FILE_BYTES = 16_000;

const SCHEMA_RULES = [
  /(^|\/)schema\.(prisma|rb|sql)$/i, // the canonical schema file — highest priority
  /\.(prisma|sql)$/i,
  /(^|\/)(migrate|migrations?|prisma)(\/|$)/i, // Rails db/migrate, Prisma, etc.
  /(^|\/)schema\.[a-z]+$/i,
  /(^|\/)(models?|entities)(\/|$)/i,
  /\.entity\.[jt]s$/i,
];

// Manifests / config that reveal the stack. Order = priority when trimming.
const STACK_FILES = [
  /(^|\/)package\.json$/i,
  /(^|\/)(tsconfig|jsconfig)\.json$/i,
  /(^|\/)(next|vite|nuxt|remix|svelte|astro|webpack|rollup)\.config\.[a-z]+$/i,
  /(^|\/)tailwind\.config\.[a-z]+$/i,
  /(^|\/)requirements\.txt$/i,
  /(^|\/)(go\.mod|Cargo\.toml|pom\.xml|build\.gradle|Gemfile|composer\.json|pyproject\.toml)$/i,
  /(^|\/)docker-compose\.ya?ml$/i,
  /(^|\/)Dockerfile$/i,
];

function pickByRules(files: RepoTreeEntry[], rules: RegExp[]): string[] {
  const scored: Array<{ path: string; rank: number; size: number }> = [];
  for (const f of files) {
    const path = f.path;
    const rank = rules.findIndex((r) => r.test(path));
    if (rank !== -1) scored.push({ path, rank, size: f.size ?? 0 });
  }
  // Prefer higher-priority rules, then shallower paths, then smaller files.
  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.path.split("/").length - b.path.split("/").length ||
      a.size - b.size,
  );
  return scored.map((s) => s.path);
}

/** A compact map of the repo: top-level dirs and file-type counts. */
function treeSummary(files: RepoTreeEntry[], truncated: boolean): string {
  const topDirs = new Map<string, number>();
  const exts = new Map<string, number>();
  for (const f of files) {
    const top = f.path.includes("/") ? f.path.split("/")[0] : "(root)";
    topDirs.set(top, (topDirs.get(top) ?? 0) + 1);
    const dot = f.path.lastIndexOf(".");
    const ext = dot > f.path.lastIndexOf("/") ? f.path.slice(dot) : "(none)";
    exts.set(ext, (exts.get(ext) ?? 0) + 1);
  }
  const fmt = (m: Map<string, number>, n: number) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => `${k} (${v})`)
      .join(", ");
  return [
    `Total files: ${files.length}${truncated ? "+ (repo tree truncated by GitHub)" : ""}`,
    `Top-level entries: ${fmt(topDirs, 15)}`,
    `File types: ${fmt(exts, 15)}`,
  ].join("\n");
}

export interface CollectedContext {
  files: Array<{ path: string; content: string }>;
  summary: string;
  truncated: boolean;
}

/**
 * Gather the files a given tool should look at. Returns null when the repo has
 * nothing relevant for that tool (e.g. schema review on a repo with no schema).
 */
export async function collectContext(
  tool: AdvisorTool,
  fullName: string,
  token: string,
): Promise<CollectedContext | null> {
  const branch = await getDefaultBranch(fullName, token);
  const { files: tree, truncated } = await listRepoTree(fullName, branch, token);
  const summary = treeSummary(tree, truncated);

  let candidates: string[];
  if (tool === "schema") {
    candidates = pickByRules(tree, SCHEMA_RULES);
    if (candidates.length === 0) return null;
  } else {
    // stack / optimize both lean on manifests + config, plus the tree summary.
    candidates = pickByRules(tree, STACK_FILES);
    if (candidates.length === 0 && tool === "stack") return null;
  }

  const files: Array<{ path: string; content: string }> = [];
  let usedBytes = 0;
  for (const path of candidates) {
    if (files.length >= MAX_FILES || usedBytes >= MAX_TOTAL_BYTES) break;
    const file = await getFileContent(fullName, path, token, branch);
    if (!file) continue;
    const clipped = file.content.slice(0, MAX_FILE_BYTES);
    const { text } = redactText(clipped);
    files.push({ path, content: text });
    usedBytes += text.length;
  }

  return { files, summary, truncated };
}

/**
 * Collect schema/DB files with their FULL contents (no redaction, no slicing) —
 * used by the deterministic ER-diagram parser, which needs complete structure.
 * Returns null when the repo has no schema files.
 */
export async function collectSchemaFiles(
  fullName: string,
  token: string,
): Promise<{ files: Array<{ path: string; content: string }>; truncated: boolean } | null> {
  const branch = await getDefaultBranch(fullName, token);
  const { files: tree, truncated } = await listRepoTree(fullName, branch, token);
  const paths = pickByRules(tree, SCHEMA_RULES);
  if (paths.length === 0) return null;

  const files: Array<{ path: string; content: string }> = [];
  let usedBytes = 0;
  const PER_FILE = 60_000;
  const TOTAL = 200_000;
  for (const path of paths) {
    if (files.length >= 20 || usedBytes >= TOTAL) break;
    const file = await getFileContent(fullName, path, token, branch);
    if (!file) continue;
    const content = file.content.slice(0, PER_FILE);
    files.push({ path, content });
    usedBytes += content.length;
  }
  return files.length > 0 ? { files, truncated } : null;
}

/**
 * One pass for the unified Schema review: read the schema files once, parse them
 * into a diagram model (deterministic, for the visualizer), AND prepare a
 * redacted/clipped context for the AI review. Returns null when there's no
 * schema in the repo.
 */
export async function collectSchemaContext(
  fullName: string,
  token: string,
): Promise<{ ctx: CollectedContext; model: SchemaModel } | null> {
  const collected = await collectSchemaFiles(fullName, token);
  if (!collected) return null;

  const model = parseSchema(collected.files);
  const files = collected.files.map((f) => ({
    path: f.path,
    content: redactText(f.content.slice(0, MAX_FILE_BYTES)).text,
  }));
  const summary = `Database schema (${model.source}): ${model.tables.length} table(s), ${model.relations.length} relationship(s) detected.`;

  return { ctx: { files, summary, truncated: collected.truncated }, model };
}

const SYSTEM_PROMPTS: Record<AdvisorTool, string> = {
  schema: `You are a senior database engineer reviewing a project's schema for a developer who may not be a DB expert. The user is also shown a visual ER diagram of these tables and relationships, so make your advice easy to map onto specific tables/columns.

Assess table/model relationships, normalization, indexing, naming, and data-integrity risks. Name the exact tables and columns involved. Include a "## What to fix" section with a prioritized, concrete checklist the user can act on. Be honest but encouraging — plainly say whether the schema is well-designed.`,
  stack: `You are a pragmatic staff engineer advising on tech-stack choices. Given the project's manifests, config, and structure, assess whether the current stack is a sound fit, note strengths and risks, and recommend concrete improvements or alternatives (only when they'd genuinely help). Avoid hype; respect what already works.`,
  optimize: `You are a performance- and maintainability-minded engineer. From the project's manifests, config, and structure, suggest concrete optimizations: dependency cleanup, build/config improvements, structural refactors, and likely performance wins. Prioritize high-impact, low-risk changes.`,
};

const OUTPUT_INSTRUCTION = `Respond with STRICT JSON only (no markdown fences) matching exactly:
{
  "rating": string,   // one of: "good", "fair", "poor"
  "headline": string, // one plain-language sentence summarizing your verdict
  "markdown": string  // the full review in Markdown: use ## headings, bullet lists, and short code snippets where useful
}
This is advice based on reading the files — never claim anything was executed or tested. Do not include real secret values.`;

export function buildAdvisorMessages(tool: AdvisorTool, ctx: CollectedContext) {
  const fileBlocks = ctx.files
    .map((f) => `FILE: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");
  const user = [
    `Project structure:`,
    ctx.summary,
    "",
    ctx.files.length > 0 ? `Relevant files:\n\n${fileBlocks}` : `(No individual files were extracted; base your review on the structure above.)`,
    "",
    OUTPUT_INSTRUCTION,
  ].join("\n");
  return [
    { role: "system" as const, content: SYSTEM_PROMPTS[tool] },
    { role: "user" as const, content: user },
  ];
}

export type AdvisorRating = "good" | "fair" | "poor";

export interface AdvisorResult {
  rating: AdvisorRating;
  headline: string;
  markdown: string;
}

const resultSchema = z.object({
  rating: z.unknown(),
  headline: z.unknown(),
  markdown: z.unknown(),
});

function toStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function coerceRating(v: string): AdvisorRating {
  const s = v.toLowerCase();
  if (s.includes("good") || s.includes("strong") || s.includes("excellent")) return "good";
  if (s.includes("poor") || s.includes("bad") || s.includes("weak")) return "poor";
  return "fair";
}

/** Strip stray fences and isolate the first JSON object. */
function extractJson(raw: string): string {
  let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  return s;
}

export function parseAdvisorResult(raw: string): AdvisorResult {
  const parsed = resultSchema.parse(JSON.parse(extractJson(raw)));
  const markdown = toStr(parsed.markdown).trim();
  if (!markdown) throw new Error("Advisor response had no report body");
  return {
    rating: coerceRating(toStr(parsed.rating)),
    headline: toStr(parsed.headline).trim() || "Review complete.",
    markdown,
  };
}
