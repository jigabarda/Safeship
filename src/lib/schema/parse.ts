// Parse a project's schema files into a table/relationship model we can draw as
// an ER diagram. This is deterministic — no LLM — so it's instant and free.
//
// Supports Prisma schemas and common SQL `CREATE TABLE` DDL (Postgres/MySQL/
// SQLite dialects). Best-effort: anything it can't confidently parse is simply
// left out rather than guessed.

export interface SchemaColumn {
  name: string;
  type: string;
  pk: boolean;
  fk: boolean;
  required: boolean;
  unique: boolean;
}

export interface SchemaTable {
  name: string;
  columns: SchemaColumn[];
}

export interface SchemaRelation {
  from: string; // table holding the foreign key (the "many" side)
  to: string; // referenced table (the "one" side)
}

export type SchemaSource = "prisma" | "sql" | "mixed" | "none";

export interface SchemaModel {
  tables: SchemaTable[];
  relations: SchemaRelation[];
  source: SchemaSource;
}

interface RawTable {
  name: string;
  columns: SchemaColumn[];
}

/** Remove `//`/`///` (or a custom) line comments, ignoring markers inside strings. */
function stripLineComments(content: string, marker: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (quote) {
      out += ch;
      if (ch === quote && content[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      continue;
    }
    if (content.startsWith(marker, i)) {
      while (i < content.length && content[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    out += ch;
  }
  return out;
}

/** Extract `keyword Name { ... }` blocks with proper brace matching. */
function extractBlocks(content: string, keyword: string): Array<{ name: string; body: string }> {
  const blocks: Array<{ name: string; body: string }> = [];
  const re = new RegExp(`\\b${keyword}\\s+(\\w+)\\s*\\{`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const name = m[1];
    const start = re.lastIndex;
    let depth = 1;
    let i = start;
    for (; i < content.length && depth > 0; i++) {
      if (content[i] === "{") depth++;
      else if (content[i] === "}") depth--;
    }
    blocks.push({ name, body: content.slice(start, i - 1) });
    re.lastIndex = i;
  }
  return blocks;
}

/** Parse a single Prisma schema file. */
function parsePrisma(content: string): { tables: RawTable[]; relations: SchemaRelation[] } {
  const clean = stripLineComments(content, "//"); // also removes /// doc comments
  const modelBlocks = extractBlocks(clean, "model");
  const modelNames = new Set(modelBlocks.map((b) => b.name));

  const tables: RawTable[] = [];
  const relations: SchemaRelation[] = [];

  for (const block of modelBlocks) {
    const tableName = block.name;
    const body = block.body;
    const columns: SchemaColumn[] = [];
    const fkColumns = new Set<string>();

    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//")) continue;

      // Model-level attributes: @@id([...]) / @@unique([...]) mark columns.
      if (line.startsWith("@@")) {
        const composite = line.match(/@@(id|unique)\s*\(\s*\[([^\]]*)\]/);
        if (composite) {
          const names = composite[2].split(",").map((s) => s.trim());
          for (const c of columns) {
            if (names.includes(c.name)) {
              if (composite[1] === "id") c.pk = true;
              else c.unique = true;
            }
          }
        }
        continue;
      }

      const field = line.match(/^(\w+)\s+([A-Za-z0-9_[\]?]+)(.*)$/);
      if (!field) continue;
      const name = field[1];
      const rawType = field[2];
      const rest = field[3] ?? "";
      const base = rawType.replace(/[[\]?]/g, "");
      const optional = rawType.includes("?");

      if (modelNames.has(base)) {
        // A relation field. Record the edge and, if given, the FK scalar column.
        relations.push({ from: tableName, to: base });
        const rel = rest.match(/@relation\([^)]*fields:\s*\[([^\]]*)\]/);
        if (rel) rel[1].split(",").forEach((f) => fkColumns.add(f.trim()));
        continue;
      }

      // A scalar (or enum) column.
      columns.push({
        name,
        type: base,
        pk: /@id\b/.test(rest),
        fk: false,
        required: !optional && !rawType.includes("[]"),
        unique: /@unique\b/.test(rest),
      });
    }

    for (const c of columns) if (fkColumns.has(c.name)) c.fk = true;
    tables.push({ name: tableName, columns });
  }

  return { tables, relations };
}

/** Split a comma-separated column list, ignoring commas inside parentheses. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

const unquote = (s: string) => s.replace(/^["'`\[]+|["'`\]]+$/g, "").split(".").pop() ?? s;

/** Parse SQL `CREATE TABLE` statements. */
function parseSql(content: string): { tables: RawTable[]; relations: SchemaRelation[] } {
  const tables: RawTable[] = [];
  const relations: SchemaRelation[] = [];

  // Drop /* block */ and -- line comments so stray parens don't confuse depth.
  content = stripLineComments(content.replace(/\/\*[\s\S]*?\*\//g, ""), "--");

  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?([`"'\[\]\w.]+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const tableName = unquote(m[1]);
    // Find the matching close paren for the column list.
    let depth = 0;
    let i = re.lastIndex - 1;
    const start = re.lastIndex;
    for (; i < content.length; i++) {
      if (content[i] === "(") depth++;
      else if (content[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = content.slice(start, i);
    const columns: SchemaColumn[] = [];
    const fkColumns = new Set<string>();

    for (const rawPart of splitTopLevel(body)) {
      const part = rawPart.trim();
      if (!part) continue;
      const upper = part.toUpperCase();

      if (upper.startsWith("PRIMARY KEY")) {
        const cols = part.match(/\(([^)]*)\)/);
        if (cols) cols[1].split(",").forEach((c) => markPk(columns, unquote(c.trim())));
        continue;
      }
      if (upper.startsWith("FOREIGN KEY") || upper.startsWith("CONSTRAINT")) {
        const fk = part.match(/foreign\s+key\s*\(([^)]*)\)\s*references\s+([`"'\[\]\w.]+)/i);
        if (fk) {
          fk[1].split(",").forEach((c) => fkColumns.add(unquote(c.trim())));
          relations.push({ from: tableName, to: unquote(fk[2]) });
        }
        continue;
      }
      if (upper.startsWith("UNIQUE") || upper.startsWith("CHECK") || upper.startsWith("INDEX")) {
        continue;
      }

      // A column definition: `name TYPE modifiers`.
      const col = part.match(/^([`"'\[\]\w.]+)\s+([`"'\[\]\w.]+)(.*)$/);
      if (!col) continue;
      const name = unquote(col[1]);
      const rest = (col[3] ?? "").toUpperCase();
      const inlineRef = part.match(/references\s+([`"'\[\]\w.]+)/i);
      if (inlineRef) {
        fkColumns.add(name);
        relations.push({ from: tableName, to: unquote(inlineRef[1]) });
      }
      columns.push({
        name,
        type: unquote(col[2]),
        pk: rest.includes("PRIMARY KEY"),
        fk: false,
        required: rest.includes("NOT NULL") || rest.includes("PRIMARY KEY"),
        unique: rest.includes("UNIQUE"),
      });
    }

    for (const c of columns) if (fkColumns.has(c.name)) c.fk = true;
    tables.push({ name: tableName, columns });
  }

  return { tables, relations };
}

function markPk(columns: SchemaColumn[], name: string) {
  for (const c of columns) if (c.name === name) c.pk = true;
}

/** Dedup relations to one edge per unordered table pair. */
function dedupRelations(relations: SchemaRelation[], tableNames: Set<string>): SchemaRelation[] {
  const seen = new Set<string>();
  const out: SchemaRelation[] = [];
  for (const r of relations) {
    if (r.from === r.to) continue; // ignore self-relations in the picture
    if (!tableNames.has(r.from) || !tableNames.has(r.to)) continue;
    const key = [r.from, r.to].sort().join("→");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Parse all provided schema files into one combined model. Prisma and SQL files
 * can coexist (source: "mixed").
 */
export function parseSchema(files: Array<{ path: string; content: string }>): SchemaModel {
  const allTables: RawTable[] = [];
  const allRelations: SchemaRelation[] = [];
  let sawPrisma = false;
  let sawSql = false;

  for (const file of files) {
    const isPrisma = /\.prisma$/i.test(file.path) || /\bmodel\s+\w+\s*\{/.test(file.content);
    const isSql = /\.sql$/i.test(file.path) || /create\s+table/i.test(file.content);

    if (isPrisma) {
      const r = parsePrisma(file.content);
      if (r.tables.length) {
        sawPrisma = true;
        allTables.push(...r.tables);
        allRelations.push(...r.relations);
      }
    }
    if (isSql) {
      const r = parseSql(file.content);
      if (r.tables.length) {
        sawSql = true;
        allTables.push(...r.tables);
        allRelations.push(...r.relations);
      }
    }
  }

  // Merge tables of the same name (e.g. a model split across files).
  const byName = new Map<string, SchemaTable>();
  for (const t of allTables) {
    const existing = byName.get(t.name);
    if (existing) {
      const have = new Set(existing.columns.map((c) => c.name));
      for (const c of t.columns) if (!have.has(c.name)) existing.columns.push(c);
    } else {
      byName.set(t.name, { name: t.name, columns: t.columns });
    }
  }

  const tables = [...byName.values()];
  const tableNames = new Set(tables.map((t) => t.name));
  const relations = dedupRelations(allRelations, tableNames);

  const source: SchemaSource =
    sawPrisma && sawSql ? "mixed" : sawPrisma ? "prisma" : sawSql ? "sql" : "none";

  return { tables, relations, source };
}
