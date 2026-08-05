"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LocalTime } from "./LocalTime";
import { scoreMeta } from "@/lib/ui";

interface RecentScan {
  id: string;
  repoFullName: string;
  status: string;
  score: number | null;
  createdAt: string;
}

const ICON_BTN =
  "flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground";

/** Header bell — the user's latest scans, reachable from any page. */
export function ActivityMenu() {
  const [open, setOpen] = useState(false);
  const [scans, setScans] = useState<RecentScan[] | null>(null);
  const [loading, setLoading] = useState(false);
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

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && scans === null && !loading) {
      setLoading(true);
      try {
        const res = await fetch("/api/scans/recent");
        const data = res.ok ? await res.json() : { scans: [] };
        setScans(data.scans ?? []);
      } catch {
        setScans([]);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label="Recent activity"
        title="Recent activity"
        aria-haspopup="menu"
        aria-expanded={open}
        className={ICON_BTN}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden>
          <path
            d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="animate-in absolute right-0 mt-2 w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
        >
          <p className="border-b border-line px-4 py-2.5 text-sm font-medium">Recent activity</p>
          {loading || scans === null ? (
            <div className="flex items-center justify-center py-8">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-transparent" />
            </div>
          ) : scans.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              No scans yet. Head to Repositories to run one.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {scans.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/scan/${s.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 px-4 py-2 transition-colors hover:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{s.repoFullName}</span>
                      <span className="block text-xs text-muted">
                        <LocalTime iso={s.createdAt} />
                      </span>
                    </span>
                    {typeof s.score === "number" ? (
                      <span
                        className={`shrink-0 text-sm font-semibold tabular-nums ${scoreMeta(s.score).text}`}
                      >
                        {s.score}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs capitalize text-muted">{s.status}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
