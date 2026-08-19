// Working out the smallest version that actually resolves an advisory.
//
// The obvious approach — upgrade to the newest release — is wrong here, and
// wrong in a way that breaks builds. OSV records a fix once per release line it
// was backported to, so a single minimatch advisory lists fixes at 3.1.4, 4.2.5,
// 5.1.8 ... and 10.2.3. Taking the newest would move a repo on 3.1.2 to 10.x
// across seven major versions to resolve a patch-level issue.
//
// Each of those entries carries the range it belongs to. The one that matters is
// the range the installed version actually falls in: for 3.1.2 that is
// "introduced 0, fixed 3.1.4", so the answer is 3.1.4 — a patch bump.

export interface OsvRangeEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
}

export interface OsvVuln {
  id?: string;
  affected?: Array<{
    package?: { name?: string; ecosystem?: string };
    ranges?: Array<{ type?: string; events?: OsvRangeEvent[] }>;
  }>;
}

/** Numeric semver comparison over major.minor.patch. Prerelease tags are dropped. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .replace(/^[^\d]*/, "")
      .split("-")[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length, 3); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function majorOf(version: string): number {
  return parseInt(version.replace(/^[^\d]*/, "").split(".")[0], 10) || 0;
}

/** Fetch one advisory from OSV. Returns null rather than throwing. */
export async function fetchAdvisory(id: string): Promise<OsvVuln | null> {
  try {
    const res = await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as OsvVuln;
  } catch {
    return null;
  }
}

/**
 * The version that fixes this advisory *for the release line the repo is on*.
 *
 * Walks the ranges for the package and returns the `fixed` of the one that
 * actually contains `currentVersion`, so the answer stays on the line already in
 * use instead of jumping release lines.
 */
export function fixedVersionForCurrent(
  vuln: OsvVuln,
  packageName: string,
  currentVersion: string,
): string | null {
  for (const affected of vuln.affected ?? []) {
    if (affected.package?.name !== packageName) continue;

    for (const range of affected.ranges ?? []) {
      if (range.type && range.type !== "SEMVER") continue;

      // Events arrive in order: an `introduced` opens a window, `fixed` closes it.
      let introduced: string | null = null;
      for (const event of range.events ?? []) {
        if (event.introduced !== undefined) {
          introduced = event.introduced;
          continue;
        }
        if (event.fixed === undefined || introduced === null) continue;

        const atOrAfterStart = compareVersions(currentVersion, introduced) >= 0;
        const beforeFix = compareVersions(currentVersion, event.fixed) < 0;
        if (atOrAfterStart && beforeFix) return event.fixed;
        introduced = null;
      }
    }
  }
  return null;
}

export interface OverrideTarget {
  packageName: string;
  currentVersion: string;
  /** Lowest version clearing every advisory on this package's release line. */
  targetVersion: string;
  advisoryIds: string[];
  /** Advisories with no fix on this line — the target does not resolve these. */
  unresolved: string[];
  /** True when the target crosses a major version, so it can be flagged. */
  majorChange: boolean;
}

/**
 * Resolve one package's advisories into a single override target: the highest of
 * the per-advisory fixes, which is the lowest version that clears all of them.
 */
export async function resolveOverrideTarget(
  packageName: string,
  currentVersion: string,
  advisoryIds: string[],
): Promise<OverrideTarget | null> {
  const vulns = await Promise.all(advisoryIds.map(fetchAdvisory));

  let target: string | null = null;
  const unresolved: string[] = [];

  for (let i = 0; i < vulns.length; i++) {
    const vuln = vulns[i];
    const fixed = vuln ? fixedVersionForCurrent(vuln, packageName, currentVersion) : null;
    if (!fixed) {
      unresolved.push(advisoryIds[i]);
      continue;
    }
    if (!target || compareVersions(fixed, target) > 0) target = fixed;
  }

  if (!target) return null;

  return {
    packageName,
    currentVersion,
    targetVersion: target,
    advisoryIds,
    unresolved,
    majorChange: majorOf(target) !== majorOf(currentVersion),
  };
}
