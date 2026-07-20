// Trigger the GitHub Actions scan workflow via a `repository_dispatch` event.
// Used by POST /api/scan in the deployed (serverless) topology: the scan runs on
// a GitHub-hosted runner instead of in-process, and POSTs its findings back to
// /api/scan/callback.

interface DispatchParams {
  scanId: string;
  repoUrl: string;
  /** Public URL the runner should POST findings back to. */
  callbackUrl: string;
}

/**
 * Fire a repository_dispatch (event_type "safeship-scan") at the repo that holds
 * .github/workflows/scan.yml. Throws on any non-2xx so the caller can mark the
 * scan failed.
 */
export async function dispatchScanWorkflow(params: DispatchParams): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_SCAN_REPO; // "owner/name"
  if (!token) throw new Error("GITHUB_DISPATCH_TOKEN is not set");
  if (!repo) throw new Error('GITHUB_SCAN_REPO is not set (e.g. "jigabarda/Safeship")');

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "safeship",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: "safeship-scan",
      client_payload: {
        scan_id: params.scanId,
        repo_url: params.repoUrl,
        callback_url: params.callbackUrl,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub dispatch failed (${res.status}): ${body.slice(0, 300)}`);
  }
}
