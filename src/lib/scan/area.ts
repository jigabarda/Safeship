// Guess which part of a project a finding belongs to, from its file path. This
// is a heuristic — a shared util is genuinely ambiguous — so it's used only to
// GROUP findings in the report, never as an authoritative label.

export type Area = "backend" | "frontend" | "data" | "config" | "other";

export const AREA_SORT: Area[] = ["backend", "frontend", "data", "config", "other"];

export const AREA_META: Record<Area, { label: string; detail: string }> = {
  backend: { label: "Backend", detail: "APIs, server code, and business logic" },
  frontend: { label: "Frontend", detail: "UI, components, and client-side code" },
  data: { label: "Data", detail: "Schema, migrations, and queries" },
  config: { label: "Config", detail: "Build, CI, and configuration files" },
  other: { label: "Other", detail: "Everything else" },
};

// Order matters: the first rule that matches wins. More specific paths are
// checked before broad extension rules.
const BACKEND_HINTS = [
  /(^|\/)(api|server|backend|controllers?|routes?|services?|handlers?|workers?|jobs?|middleware)(\/|$)/i,
  /\/app\/api\//i, // Next.js route handlers
  /\.(go|rb|php|py|java|kt|rs|cs)$/i, // typically server languages
  /(^|\/)(main|server|app)\.(js|ts)$/i,
];

const DATA_HINTS = [
  /\.(sql|prisma)$/i,
  /(^|\/)(migrations?|seeds?|prisma|db|database)(\/|$)/i,
  /(^|\/)schema\./i,
  /\.(sqlite|db)$/i,
];

const FRONTEND_HINTS = [
  /\.(tsx|jsx|vue|svelte)$/i,
  /\.(css|scss|sass|less)$/i,
  /(^|\/)(components?|pages?|views?|ui|client|styles?|public|assets)(\/|$)/i,
  /\.html?$/i,
];

const CONFIG_HINTS = [
  /(^|\/)\.github(\/|$)/i,
  /(^|\/)(config|configs|\.config)(\/|$)/i,
  /\.(ya?ml|toml|ini|env|conf)$/i,
  /(^|\/)(dockerfile|makefile|\.dockerignore|\.gitignore)$/i,
  /(package|tsconfig|next\.config|vite\.config|webpack\.config|eslint|prettier|tailwind)\./i,
  /\.(lock)$/i,
];

function matches(path: string, rules: RegExp[]): boolean {
  return rules.some((r) => r.test(path));
}

/** Classify a file path into a coarse project area. */
export function classifyArea(filePath: string | null | undefined): Area {
  if (!filePath) return "other";
  const p = filePath.replace(/\\/g, "/");
  // Data and backend before frontend: e.g. "prisma/schema.prisma" is data even
  // though it lives near app code; an "api" route is backend before extension.
  if (matches(p, DATA_HINTS)) return "data";
  if (matches(p, BACKEND_HINTS)) return "backend";
  if (matches(p, FRONTEND_HINTS)) return "frontend";
  if (matches(p, CONFIG_HINTS)) return "config";
  return "other";
}
