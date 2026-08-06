import Link from "next/link";
import { scoreMeta } from "@/lib/ui";
import { LocalTime } from "@/components/LocalTime";

// Presentational list of scans, shared by the dashboard (recent) and the full
// Scans page. Server component — no client state, so dates render once on the
// server without a hydration mismatch.

export interface ScanListItem {
  id: string;
  repoFullName: string;
  createdAt: Date | string;
  score: number | null;
  status: string;
}

export function ScanList({
  scans,
  maxHeightClass,
}: {
  scans: ScanListItem[];
  /** When set, the list scrolls within this height (used in the sidebar). */
  maxHeightClass?: string;
}) {
  return (
    <ul
      className={`flex flex-col divide-y divide-line rounded-xl border border-line bg-surface shadow-sm ${
        maxHeightClass ? `${maxHeightClass} overflow-y-auto` : "overflow-hidden"
      }`}
    >
      {scans.map((s) => (
        <li key={s.id}>
          <Link
            href={`/scan/${s.id}`}
            className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface-2"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{s.repoFullName}</p>
              <p className="mt-0.5 text-xs text-muted">
                <LocalTime iso={new Date(s.createdAt).toISOString()} />
              </p>
            </div>
            {typeof s.score === "number" ? (
              <span
                className={`shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-sm font-semibold tabular-nums ${scoreMeta(s.score).text}`}
              >
                {s.score}
                <span className="text-muted">/100</span>
              </span>
            ) : (
              <StatusBadge status={s.status} />
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StatusBadge({ status }: { status: string }) {
  const running = status === "queued" || status === "running";
  const failed = status === "failed";
  const cls = failed
    ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
    : running
      ? "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
      : "bg-surface-2 text-muted"; // done (scoreless) or cancelled
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}
