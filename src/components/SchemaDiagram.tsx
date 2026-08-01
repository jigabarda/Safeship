"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SchemaModel, SchemaTable } from "@/lib/schema/parse";

// A dependency-free ER diagram. Table cards flow in a wrap layout; relationship
// lines are drawn as an SVG overlay whose endpoints are measured from where the
// cards actually land, and recomputed on resize. Hovering a table highlights its
// connections.

interface Edge {
  from: string;
  to: string;
  d: string;
  a1: { x: number; y: number };
  a2: { x: number; y: number };
}

interface Rect {
  cx: number;
  cy: number;
  width: number;
  height: number;
}

/** Point where the ray from a rect's center toward (tx,ty) meets its border. */
function borderPoint(r: Rect, tx: number, ty: number): { x: number; y: number } {
  const dx = tx - r.cx;
  const dy = ty - r.cy;
  if (dx === 0 && dy === 0) return { x: r.cx, y: r.cy };
  const sx = dx !== 0 ? r.width / 2 / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? r.height / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: r.cx + dx * s, y: r.cy + dy * s };
}

export function SchemaDiagram({ model }: { model: SchemaModel }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [edges, setEdges] = useState<Edge[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hovered, setHovered] = useState<string | null>(null);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of model.relations) {
      if (!map.has(r.from)) map.set(r.from, new Set());
      if (!map.has(r.to)) map.set(r.to, new Set());
      map.get(r.from)!.add(r.to);
      map.get(r.to)!.add(r.from);
    }
    return map;
  }, [model.relations]);

  const compute = useCallback(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const contBox = cont.getBoundingClientRect();
    const rects = new Map<string, Rect>();
    for (const [name, el] of cardRefs.current) {
      const b = el.getBoundingClientRect();
      rects.set(name, {
        cx: b.left - contBox.left + b.width / 2,
        cy: b.top - contBox.top + b.height / 2,
        width: b.width,
        height: b.height,
      });
    }

    const next: Edge[] = [];
    for (const rel of model.relations) {
      const from = rects.get(rel.from);
      const to = rects.get(rel.to);
      if (!from || !to) continue;
      const a1 = borderPoint(from, to.cx, to.cy);
      const a2 = borderPoint(to, from.cx, from.cy);
      // Gentle curve so parallel edges don't perfectly overlap.
      const mx = (a1.x + a2.x) / 2;
      const my = (a1.y + a2.y) / 2;
      next.push({ from: rel.from, to: rel.to, a1, a2, d: `M ${a1.x} ${a1.y} Q ${mx} ${my} ${a2.x} ${a2.y}` });
    }
    setEdges(next);
    setSize({ w: cont.scrollWidth, h: cont.scrollHeight });
  }, [model.relations]);

  useLayoutEffect(() => {
    compute();
    const cont = containerRef.current;
    if (!cont) return;
    const ro = new ResizeObserver(() => compute());
    ro.observe(cont);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [compute]);

  const isDim = (name: string) =>
    hovered !== null && hovered !== name && !(adjacency.get(hovered)?.has(name) ?? false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium capitalize text-foreground/80">
          {model.source === "none" ? "schema" : model.source}
        </span>
        <span>
          {model.tables.length} table{model.tables.length === 1 ? "" : "s"} ·{" "}
          {model.relations.length} relationship{model.relations.length === 1 ? "" : "s"}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <Legend swatch="bg-amber-500" label="PK" />
          <Legend swatch="bg-sky-500" label="FK" />
        </span>
      </div>

      <div className="overflow-auto rounded-2xl border border-line bg-background/40 p-4">
        <div ref={containerRef} className="relative flex min-w-fit flex-wrap content-start gap-6">
          {/* Edge overlay (behind the cards) */}
          <svg
            className="pointer-events-none absolute inset-0"
            width={size.w}
            height={size.h}
            style={{ overflow: "visible" }}
            aria-hidden
          >
            {edges.map((e, i) => {
              const active = hovered === e.from || hovered === e.to;
              const dim = hovered !== null && !active;
              return (
                <g key={i} className={dim ? "opacity-15" : ""}>
                  <path
                    d={e.d}
                    fill="none"
                    stroke={active ? "var(--brand)" : "var(--line-strong)"}
                    strokeWidth={active ? 2.5 : 1.5}
                  />
                  <circle cx={e.a1.x} cy={e.a1.y} r={active ? 4 : 3} fill={active ? "var(--brand)" : "var(--line-strong)"} />
                  <circle cx={e.a2.x} cy={e.a2.y} r={active ? 4 : 3} fill={active ? "var(--brand)" : "var(--line-strong)"} />
                </g>
              );
            })}
          </svg>

          {model.tables.map((t) => (
            <TableCard
              key={t.name}
              table={t}
              relationCount={adjacency.get(t.name)?.size ?? 0}
              dim={isDim(t.name)}
              highlighted={hovered === t.name}
              onHover={setHovered}
              cardRef={(el) => {
                if (el) cardRefs.current.set(t.name, el);
                else cardRefs.current.delete(t.name);
              }}
            />
          ))}
        </div>
      </div>

      {model.relations.length === 0 && (
        <p className="text-xs text-muted">
          No foreign-key relationships were detected between these tables.
        </p>
      )}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${swatch}`} />
      {label}
    </span>
  );
}

function TableCard({
  table,
  relationCount,
  dim,
  highlighted,
  onHover,
  cardRef,
}: {
  table: SchemaTable;
  relationCount: number;
  dim: boolean;
  highlighted: boolean;
  onHover: (name: string | null) => void;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={cardRef}
      onMouseEnter={() => onHover(table.name)}
      onMouseLeave={() => onHover(null)}
      className={`relative z-10 w-56 shrink-0 overflow-hidden rounded-xl border bg-surface shadow-sm transition-opacity ${
        highlighted ? "border-brand/60 ring-1 ring-brand/30" : "border-line"
      } ${dim ? "opacity-30" : "opacity-100"}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2/60 px-3 py-2">
        <span className="truncate font-mono text-sm font-semibold">{table.name}</span>
        {relationCount > 0 && (
          <span className="shrink-0 rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted ring-1 ring-line">
            {relationCount}
          </span>
        )}
      </div>
      <ul className="divide-y divide-line/60">
        {table.columns.map((c) => (
          <li key={c.name} className="flex items-center gap-2 px-3 py-1.5 text-xs">
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              {c.pk && <Dot className="bg-amber-500" title="Primary key" />}
              {c.fk && !c.pk && <Dot className="bg-sky-500" title="Foreign key" />}
              <span className={`truncate font-mono ${c.pk ? "font-semibold" : ""}`}>{c.name}</span>
              {c.unique && !c.pk && (
                <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted">uniq</span>
              )}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-muted">
              {c.type}
              {!c.required && "?"}
            </span>
          </li>
        ))}
        {table.columns.length === 0 && (
          <li className="px-3 py-2 text-xs italic text-muted">no columns parsed</li>
        )}
      </ul>
    </div>
  );
}

function Dot({ className, title }: { className: string; title: string }) {
  return <span title={title} className={`h-1.5 w-1.5 shrink-0 rounded-full ${className}`} />;
}
