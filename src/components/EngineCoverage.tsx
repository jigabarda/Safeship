import { EXPECTED_ENGINES, type EngineStatus } from "@/lib/scan/engineStatus";

/**
 * What this report actually covers.
 *
 * An engine that failed to run produces no findings, which is exactly what a
 * clean repo produces. Without saying so, a report quietly claims more coverage
 * than it has — so a missing engine is stated plainly rather than left implied.
 */
export function EngineCoverage({ engines }: { engines?: EngineStatus[] | null }) {
  // Scans from before this was recorded: say nothing rather than guess.
  if (!engines || engines.length === 0) return null;

  const missing = engines.filter((e) => !e.available);
  const ran = engines.filter((e) => e.available);

  if (missing.length === 0) {
    return (
      <p className="text-xs text-muted">
        All {ran.length} engines ran ·{" "}
        {ran.map((e) => e.engine).join(", ")}
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/25 dark:text-amber-300">
      <p className="font-medium">
        {missing.length === 1
          ? `One engine didn't run — this report is incomplete.`
          : `${missing.length} engines didn't run — this report is incomplete.`}
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {missing.map((e) => {
          const expected = EXPECTED_ENGINES.find((x) => x.engine === e.engine);
          return (
            <li key={e.engine} className="text-xs">
              <strong>{expected?.label ?? e.engine}</strong>
              {expected ? ` (${expected.covers})` : ""} — nothing from it is in these
              results.
              {e.error ? <span className="opacity-80"> {e.error}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
