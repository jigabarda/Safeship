// Best-effort cancellation of the GitHub Actions run backing a scan.
//
// repository_dispatch doesn't hand back a run id, so the workflow stamps the
// scan id into its run-name and we find the run by that. Everything here is
// best-effort: the scan row is marked cancelled regardless, and a runner we
// can't reach simply finishes and has its callback ignored.

const GITHUB_API = "https://api.github.com";

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "safeship",
  };
}

/**
 * Try to cancel the in-flight workflow run for a scan.
 * Returns true only when GitHub accepted the cancellation.
 */
export async function cancelScanWorkflow(scanId: string): Promise<boolean> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_SCAN_REPO;
  if (!token || !repo) return false;

  try {
    const listed = await fetch(
      `${GITHUB_API}/repos/${repo}/actions/runs?event=repository_dispatch&per_page=30`,
      { headers: headers(token), cache: "no-store" },
    );
    if (!listed.ok) return false;

    const data = (await listed.json()) as {
      workflow_runs?: Array<{
        id: number;
        name?: string;
        display_title?: string;
        status?: string;
      }>;
    };

    const live = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);
    const run = (data.workflow_runs ?? []).find(
      (r) =>
        (r.name?.includes(scanId) || r.display_title?.includes(scanId)) &&
        live.has(r.status ?? ""),
    );
    if (!run) return false;

    const cancelled = await fetch(
      `${GITHUB_API}/repos/${repo}/actions/runs/${run.id}/cancel`,
      { method: "POST", headers: headers(token) },
    );
    return cancelled.ok;
  } catch (e) {
    console.warn(`[scan ${scanId}] could not cancel the workflow run:`, e);
    return false;
  }
}
