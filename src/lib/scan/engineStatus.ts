import type { EngineName } from "../engines/types";

// Per-engine outcome, persisted on the scan so a report can say which engines
// actually ran. Without it a missing engine and a clean repo look identical —
// both simply produce no findings — and every number on the report silently
// covers less ground than it appears to.

/** Every engine a scan is expected to run, with what it is responsible for. */
export const EXPECTED_ENGINES: Array<{ engine: EngineName; label: string; covers: string }> = [
  { engine: "gitleaks", label: "gitleaks", covers: "secrets" },
  { engine: "osv", label: "osv-scanner", covers: "vulnerable dependencies" },
  { engine: "semgrep", label: "semgrep", covers: "insecure code" },
  { engine: "trivy", label: "trivy", covers: "infrastructure config" },
];

export interface EngineStatus {
  engine: string;
  available: boolean;
  error?: string;
  durationMs?: number;
  findingCount?: number;
}

/**
 * Coerce whatever is stored in Scan.engines (Prisma Json) into a clean list.
 * Returns null — meaning "not recorded" — rather than an empty list, so a scan
 * from before this was tracked isn't reported as having run no engines.
 */
export function parseEngineStatus(raw: unknown): EngineStatus[] | null {
  if (!Array.isArray(raw)) return null;
  const out: EngineStatus[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const engine = (item as { engine?: unknown }).engine;
      const available = (item as { available?: unknown }).available;
      if (typeof engine === "string" && typeof available === "boolean") {
        const error = (item as { error?: unknown }).error;
        const durationMs = (item as { durationMs?: unknown }).durationMs;
        const findingCount = (item as { findingCount?: unknown }).findingCount;
        out.push({
          engine,
          available,
          error: typeof error === "string" ? error : undefined,
          durationMs: typeof durationMs === "number" ? durationMs : undefined,
          findingCount: typeof findingCount === "number" ? findingCount : undefined,
        });
      }
    }
  }
  return out.length > 0 ? out : null;
}

/** Engines that were expected but did not run. */
export function missingEngines(statuses: EngineStatus[] | null): string[] {
  if (!statuses) return [];
  return statuses.filter((s) => !s.available).map((s) => s.engine);
}

/**
 * Shape engine results for a Prisma Json column. Optional fields are dropped
 * rather than written as `undefined`, which is not valid JSON input.
 */
export function toJsonEngineStatuses(
  metas: Array<{
    engine: string;
    available: boolean;
    error?: string;
    durationMs?: number;
    findingCount?: number;
  }>,
): Array<Record<string, string | number | boolean>> {
  return metas.map((m) => ({
    engine: m.engine,
    available: m.available,
    ...(m.error ? { error: m.error } : {}),
    ...(typeof m.durationMs === "number" ? { durationMs: m.durationMs } : {}),
    ...(typeof m.findingCount === "number" ? { findingCount: m.findingCount } : {}),
  }));
}
