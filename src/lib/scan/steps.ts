// Canonical scan pipeline steps, shared by the runner/API (which report progress)
// and the report UI (which renders it). Safe to import from client components —
// pure constants, no server-only dependencies.

export const SCAN_STEP_KEYS = [
  "starting",
  "preparing",
  "scanning",
  "reporting",
] as const;

export type ScanStepKey = (typeof SCAN_STEP_KEYS)[number];

/** One recorded progress event: a step key and when it began. */
export interface ScanStepEvent {
  key: ScanStepKey;
  at: string; // ISO timestamp
}

export const SCAN_STEP_META: Record<ScanStepKey, { label: string; detail: string }> = {
  starting: {
    label: "Starting the scan",
    detail: "Getting the scan environment ready",
  },
  preparing: {
    label: "Preparing the security engines",
    detail: "gitleaks · osv-scanner · semgrep",
  },
  scanning: {
    label: "Running the security engines",
    detail: "Cloning your repo, then scanning for secrets, dependencies, and code patterns",
  },
  reporting: {
    label: "Preparing your report",
    detail: "Scoring and ranking the findings",
  },
};

export function isScanStepKey(value: unknown): value is ScanStepKey {
  return (
    typeof value === "string" &&
    (SCAN_STEP_KEYS as readonly string[]).includes(value)
  );
}

/**
 * Coerce whatever is stored in Scan.steps (Prisma Json) into a clean, ordered
 * list of known events. Unknown/malformed entries are dropped rather than thrown.
 */
export function parseScanSteps(raw: unknown): ScanStepEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: ScanStepEvent[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const key = (item as { key?: unknown }).key;
      const at = (item as { at?: unknown }).at;
      if (isScanStepKey(key) && typeof at === "string") {
        out.push({ key, at });
      }
    }
  }
  return out;
}
