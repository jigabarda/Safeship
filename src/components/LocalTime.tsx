"use client";

import { useEffect, useState } from "react";

// Render a timestamp in the VIEWER's local timezone. Server components can't know
// the browser's timezone, so we render a deterministic UTC string first (matching
// on the server and the client's first paint, so there's no hydration mismatch),
// then swap to local time once mounted.

function format(iso: string, withTime: boolean, tz?: string): string {
  const opts: Intl.DateTimeFormatOptions = withTime
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" };
  if (tz) opts.timeZone = tz;
  return new Date(iso).toLocaleString(tz ? "en-US" : undefined, opts);
}

export function LocalTime({ iso, withTime = true }: { iso: string; withTime?: boolean }) {
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    // Deferred (not a synchronous set during the effect) so it reads as a
    // post-mount update, matching the codebase's mounted-swap pattern.
    const id = requestAnimationFrame(() => setLocal(format(iso, withTime)));
    return () => cancelAnimationFrame(id);
  }, [iso, withTime]);

  // Until mounted: the UTC string (with a label so it's not mistaken for local).
  return <>{local ?? `${format(iso, withTime, "UTC")} UTC`}</>;
}
