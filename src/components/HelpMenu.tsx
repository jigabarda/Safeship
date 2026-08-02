"use client";

import { useEffect, useRef, useState } from "react";

const ICON_BTN =
  "flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground";

/** Header help — a short guide to what Safeship does and how it treats your code. */
export function HelpMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Help"
        title="Help"
        aria-haspopup="menu"
        aria-expanded={open}
        className={ICON_BTN}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M9.5 9a2.5 2.5 0 013.9-2.1c1.4.9 1.1 2.6-.4 3.4-.9.5-1 .9-1 1.7"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="currentColor" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="animate-in absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-lg"
        >
          <p className="text-sm font-semibold">How Safeship works</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-muted">
            <li className="flex gap-2">
              <span className="text-brand">1.</span> Pick a repo in Repositories and hit Scan.
            </li>
            <li className="flex gap-2">
              <span className="text-brand">2.</span> It checks for leaked secrets, insecure code,
              and vulnerable dependencies.
            </li>
            <li className="flex gap-2">
              <span className="text-brand">3.</span> Every finding is explained in plain English,
              with a copy-paste fix.
            </li>
          </ul>
          <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
            Safeship only <strong className="text-foreground">reads</strong> your code — it never
            attacks anything, and never writes without opening a pull request you review.
          </p>
          <div className="mt-3 flex flex-col gap-1 border-t border-line pt-3 text-sm">
            <a
              href="https://github.com/jigabarda/Safeship"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
            >
              Documentation &amp; source →
            </a>
            <a
              href="https://github.com/jigabarda/Safeship/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
            >
              Report a problem →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
