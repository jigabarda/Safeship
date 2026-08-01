import { Fragment, type ReactNode } from "react";

// A small, dependency-free Markdown renderer — enough for the LLM's advisor
// reports and assistant replies: headings, lists, fenced + inline code, bold.
// Not a full CommonMark parser; deliberately minimal and safe (no raw HTML).

function renderInline(text: string, keyBase: string): ReactNode[] {
  // Split on `code` and **bold**, keeping the delimiters.
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return tokens.map((tok, i) => {
    const key = `${keyBase}-${i}`;
    if (tok.startsWith("`") && tok.endsWith("`")) {
      return (
        <code
          key={key}
          className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em] text-foreground/90"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    if (tok.startsWith("**") && tok.endsWith("**")) {
      return (
        <strong key={key} className="font-semibold">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={key}>{tok}</Fragment>;
  });
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => (
      <li key={i} className="ml-1">
        {renderInline(it, `li-${blocks.length}-${i}`)}
      </li>
    ));
    blocks.push(
      list.ordered ? (
        <ol key={`b${blocks.length}`} className="ml-5 list-decimal space-y-1">
          {items}
        </ol>
      ) : (
        <ul key={`b${blocks.length}`} className="ml-5 list-disc space-y-1 marker:text-muted">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw;

    // Fenced code blocks.
    if (/^\s*```/.test(line)) {
      if (code) {
        blocks.push(
          <pre
            key={`b${blocks.length}`}
            className="overflow-x-auto rounded-lg border border-line bg-surface-2/40 p-3 font-mono text-xs leading-relaxed"
          >
            {code.join("\n")}
          </pre>,
        );
        code = null;
      } else {
        flushList();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }

    // Headings.
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushList();
      const level = h[1].length;
      const cls =
        level <= 1
          ? "mt-1 text-lg font-semibold"
          : level === 2
            ? "mt-2 text-base font-semibold"
            : "mt-1 text-sm font-semibold uppercase tracking-wide text-muted";
      blocks.push(
        <p key={`b${blocks.length}`} className={cls}>
          {renderInline(h[2], `h-${blocks.length}`)}
        </p>,
      );
      continue;
    }

    // List items.
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const ordered = Boolean(ol);
      const item = (ul ?? ol)![1];
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(item);
      continue;
    }

    // Blank line ends a list; otherwise a paragraph.
    if (line.trim() === "") {
      flushList();
      continue;
    }
    flushList();
    blocks.push(
      <p key={`b${blocks.length}`} className="leading-relaxed">
        {renderInline(line, `p-${blocks.length}`)}
      </p>,
    );
  }
  flushList();
  if (code) {
    blocks.push(
      <pre
        key={`b${blocks.length}`}
        className="overflow-x-auto rounded-lg border border-line bg-surface-2/40 p-3 font-mono text-xs leading-relaxed"
      >
        {code.join("\n")}
      </pre>,
    );
  }

  return <div className="flex flex-col gap-2 text-sm text-foreground/90">{blocks}</div>;
}
