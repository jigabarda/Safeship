import { getFileContent } from "@/lib/github/repoFiles";

// Upgrading a vulnerable dependency, for the case where that is actually
// possible: a package the repo depends on directly.
//
// Most advisories are not that case. Measured across two real repos, 37 of 41
// vulnerable packages were transitive — pulled in by something else and absent
// from the manifest — where changing a version number fixes nothing. Offering a
// button that silently fails on three quarters of findings would be worse than
// offering none, so this deliberately covers only direct dependencies and says
// so plainly for the rest.
//
// npm only for now. Ruby's direct gems accounted for 5 findings against npm's
// 29, and `bundle update` has different semantics worth handling on its own.

export const MANIFEST_PATH = "package.json";

export interface DirectDependency {
  name: string;
  /** The range as written, e.g. "^1.6.0". */
  range: string;
  field: "dependencies" | "devDependencies";
}

export interface Manifest {
  path: string;
  content: string;
  sha: string;
  direct: Map<string, DirectDependency>;
}

/** Read package.json from the default branch. Returns null if there isn't one. */
export async function loadManifest(
  fullName: string,
  token: string,
  ref?: string,
): Promise<Manifest | null> {
  const file = await getFileContent(fullName, MANIFEST_PATH, token, ref);
  if (!file) return null;

  let parsed: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  try {
    parsed = JSON.parse(file.content);
  } catch {
    return null; // Unparseable manifest — treat as "no direct deps known".
  }

  const direct = new Map<string, DirectDependency>();
  for (const field of ["dependencies", "devDependencies"] as const) {
    for (const [name, range] of Object.entries(parsed[field] ?? {})) {
      if (typeof range === "string") direct.set(name, { name, range, field });
    }
  }

  return { path: file.path, content: file.content, sha: file.sha, direct };
}

/** The newest published version of a package, or null if it can't be resolved. */
export async function latestNpmVersion(name: string): Promise<string | null> {
  // The registry accepts scoped names as-is; encode each segment for safety.
  const path = name.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`https://registry.npmjs.org/${path}/latest`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { version?: string };
  return typeof data.version === "string" ? data.version : null;
}

/** Keep the range operator the manifest already used (^, ~, >=, or exact). */
export function rangeWithSameOperator(currentRange: string, version: string): string {
  const operator = currentRange.match(/^(\^|~|>=|>|<=|<|=)?/)?.[1] ?? "";
  return `${operator}${version}`;
}

/**
 * Rewrite one dependency's version in package.json.
 *
 * The edit is a targeted textual replacement rather than parse-and-restringify,
 * so the pull request shows a one-line diff instead of reformatting a file the
 * user maintains by hand.
 */
export function bumpManifest(
  content: string,
  name: string,
  newRange: string,
): string | null {
  // Scanned rather than pattern-matched: package names legitimately contain
  // regex metacharacters, and the edit must land on the value of this exact key
  // rather than anywhere the name happens to appear.
  const isSpace = (c: string) => c.trim() === "";
  const key = JSON.stringify(name); // the quoted key, escaped as JSON would write it

  let from = 0;
  for (;;) {
    const keyAt = content.indexOf(key, from);
    if (keyAt === -1) return null;
    from = keyAt + key.length;

    let i = from;
    while (i < content.length && isSpace(content[i])) i++;
    if (content[i] !== ":") continue; // a string value that merely equals the name
    i++;
    while (i < content.length && isSpace(content[i])) i++;
    if (content[i] !== '"') continue; // not a plain version string

    const valueStart = i + 1;
    const valueEnd = content.indexOf('"', valueStart);
    if (valueEnd === -1) return null;

    return content.slice(0, valueStart) + newRange + content.slice(valueEnd);
  }
}

/** Compare two semver-ish versions. Returns true when `next` is newer. */
export function isNewerVersion(current: string, next: string): boolean {
  const clean = (v: string) => v.replace(/^[^\d]*/, "").split("-")[0];
  const a = clean(current).split(".").map((n) => parseInt(n, 10) || 0);
  const b = clean(next).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (y > x) return true;
    if (y < x) return false;
  }
  return false;
}

/** The indentation package.json already uses, so an edit doesn't reformat it. */
export function detectIndent(content: string): string | number {
  for (const line of content.split("\n").slice(1)) {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith('"')) continue;
    const lead = line.slice(0, line.length - trimmed.length);
    if (lead.length === 0) continue;
    return lead.includes("\t") ? "\t" : lead.length;
  }
  return 2;
}

/**
 * Merge npm `overrides` entries into package.json.
 *
 * Unlike a version bump this cannot be a targeted textual edit — the block may
 * not exist yet — so the file is parsed and re-serialised with its own
 * indentation and trailing newline preserved. Round-tripping a manifest with no
 * changes must produce a byte-identical file; if it doesn't, the caller is told
 * rather than handed a diff full of reformatting.
 */
export function applyOverrides(
  content: string,
  overrides: Record<string, string>,
): { content: string; reformatted: boolean } | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  const indent = detectIndent(content);
  const trailingNewline = content.endsWith("\n") ? "\n" : "";

  // Does serialising round-trip cleanly? If not, the edit would reformat the
  // file and the caller should say so in the pull request.
  const roundTripped = JSON.stringify(parsed, null, indent) + trailingNewline;
  const reformatted = roundTripped !== content;

  const existing =
    typeof parsed.overrides === "object" && parsed.overrides !== null
      ? (parsed.overrides as Record<string, unknown>)
      : {};
  parsed.overrides = { ...existing, ...overrides };

  return {
    content: JSON.stringify(parsed, null, indent) + trailingNewline,
    reformatted,
  };
}
