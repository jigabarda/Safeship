import type { StructureNode } from "@/lib/advisor/structureTree";

// Renders the Advisor's recommended folder structure as an indented file tree.
// Dependency-free; folders are highlighted, files muted, with optional notes.
export function StructureTree({ root }: { root: StructureNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface p-4">
      <ul className="font-mono text-sm leading-6">
        <TreeNode node={root} />
      </ul>
    </div>
  );
}

function TreeNode({ node }: { node: StructureNode }) {
  const isDir = Boolean(node.children && node.children.length > 0);
  return (
    <li>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        {isDir ? (
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-brand" aria-hidden>
            <path
              d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-muted" aria-hidden>
            <path
              d="M6 3h8l4 4v14H6V3z M14 3v4h4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        )}
        <span className={isDir ? "font-medium text-foreground" : "text-foreground/80"}>
          {node.name}
          {isDir ? "/" : ""}
        </span>
        {node.note && <span className="ml-1 text-xs italic text-muted">— {node.note}</span>}
      </span>
      {isDir && (
        <ul className="ml-[9px] border-l border-line pl-3.5">
          {node.children!.map((child, i) => (
            <TreeNode key={`${child.name}-${i}`} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}
