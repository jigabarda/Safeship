// Read files from — and open pull requests against — a user's GitHub repo, using
// the OAuth access token we already store for them (it carries the `repo` scope).
//
// This is what lets the Advisor and the "Fix with AI" feature work entirely from
// Vercel: no clone, no Actions runner. We only ever touch repos the signed-in
// user owns/collaborates on, because it's THEIR token doing the calls.

const GITHUB_API = "https://api.github.com";

function ghHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "safeship",
  };
}

/** Raised when GitHub returns a non-2xx; carries the status for the caller. */
export class GitHubApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

async function gh<T>(
  token: string,
  path: string,
  init?: RequestInit & { rawBody?: string },
): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: { ...ghHeaders(token), ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GitHubApiError(
      res.status,
      `GitHub ${res.status} on ${path}: ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as T;
}

export interface RepoTreeEntry {
  path: string;
  /** "blob" (file) or "tree" (directory). */
  type: string;
  size?: number;
}

/** The repo's default branch name (e.g. "main"). */
export async function getDefaultBranch(
  fullName: string,
  token: string,
): Promise<string> {
  const repo = await gh<{ default_branch: string }>(token, `/repos/${fullName}`);
  return repo.default_branch;
}

/**
 * A flat list of every file in the repo at `ref`. Uses the git-trees API with
 * `recursive=1`, which is a single request for the whole tree. Large repos may
 * be truncated by GitHub — we surface that so callers can note it.
 */
export async function listRepoTree(
  fullName: string,
  ref: string,
  token: string,
): Promise<{ files: RepoTreeEntry[]; truncated: boolean }> {
  const data = await gh<{ tree: RepoTreeEntry[]; truncated: boolean }>(
    token,
    `/repos/${fullName}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  );
  return {
    files: data.tree.filter((e) => e.type === "blob"),
    truncated: Boolean(data.truncated),
  };
}

export interface RepoFile {
  path: string;
  content: string;
  /** Blob SHA — required to update the file later. */
  sha: string;
}

/**
 * Fetch a single file's decoded text content plus its blob SHA. Returns null if
 * the file doesn't exist or isn't a regular text file.
 */
export async function getFileContent(
  fullName: string,
  path: string,
  token: string,
  ref?: string,
): Promise<RepoFile | null> {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  try {
    const data = await gh<{
      type: string;
      encoding?: string;
      content?: string;
      sha: string;
    }>(token, `/repos/${fullName}/contents/${encodeURItPath(path)}${q}`);
    if (data.type !== "file" || data.encoding !== "base64" || !data.content) {
      return null;
    }
    const content = Buffer.from(data.content, "base64").toString("utf8");
    return { path, content, sha: data.sha };
  } catch (e) {
    if (e instanceof GitHubApiError && e.status === 404) return null;
    throw e;
  }
}

/** Encode a repo path for the contents API without mangling the slashes. */
function encodeURItPath(path: string): string {
  return path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

/**
 * Create a new branch `newBranch` pointing at the tip of `fromBranch`.
 * No-ops gracefully if the branch already exists (422).
 */
export async function createBranch(
  fullName: string,
  fromBranch: string,
  newBranch: string,
  token: string,
): Promise<void> {
  const ref = await gh<{ object: { sha: string } }>(
    token,
    `/repos/${fullName}/git/ref/heads/${encodeURIComponent(fromBranch)}`,
  );
  try {
    await gh(token, `/repos/${fullName}/git/refs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ref: `refs/heads/${newBranch}`,
        sha: ref.object.sha,
      }),
    });
  } catch (e) {
    // 422 = ref already exists; reuse it rather than failing the whole flow.
    if (!(e instanceof GitHubApiError && e.status === 422)) throw e;
  }
}

/** Commit new content for a file on `branch`. Pass the existing blob SHA to update. */
export async function putFile(
  fullName: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  sha: string,
  token: string,
): Promise<void> {
  await gh(token, `/repos/${fullName}/contents/${encodeURItPath(path)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch,
      sha,
    }),
  });
}

export interface PullRequest {
  number: number;
  htmlUrl: string;
}

/** Open a pull request from `head` into `base`. */
export async function openPullRequest(
  fullName: string,
  head: string,
  base: string,
  title: string,
  body: string,
  token: string,
): Promise<PullRequest> {
  const pr = await gh<{ number: number; html_url: string }>(
    token,
    `/repos/${fullName}/pulls`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, head, base, body }),
    },
  );
  return { number: pr.number, htmlUrl: pr.html_url };
}
