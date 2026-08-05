// The recommended folder/file structure the Advisor produces. A node with
// `children` is a folder; without, it's a file. `note` is an optional hint
// like "moved from lib/". Parsed defensively from the model's JSON.

export interface StructureNode {
  name: string;
  note?: string;
  children?: StructureNode[];
}

function coerceNode(value: unknown, depth: number): StructureNode | null {
  if (depth > 12 || !value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) return null;

  const node: StructureNode = { name };
  if (typeof o.note === "string" && o.note.trim()) node.note = o.note.trim().slice(0, 80);
  if (Array.isArray(o.children)) {
    const kids = o.children
      .map((c) => coerceNode(c, depth + 1))
      .filter((n): n is StructureNode => n !== null)
      .slice(0, 200);
    if (kids.length > 0) node.children = kids;
  }
  return node;
}

export function parseStructureTree(value: unknown): StructureNode | null {
  return coerceNode(value, 0);
}

/** Render the tree as an ASCII diagram for STRUCTURE.md. */
export function treeToAscii(root: StructureNode): string {
  const lines: string[] = [`${root.name || "."}${root.children ? "/" : ""}`];
  const walk = (node: StructureNode, prefix: string) => {
    const kids = node.children ?? [];
    kids.forEach((k, i) => {
      const last = i === kids.length - 1;
      const isDir = Boolean(k.children && k.children.length > 0);
      lines.push(
        `${prefix}${last ? "└── " : "├── "}${k.name}${isDir ? "/" : ""}${k.note ? `   # ${k.note}` : ""}`,
      );
      walk(k, prefix + (last ? "    " : "│   "));
    });
  };
  walk(root, "");
  return lines.join("\n");
}
