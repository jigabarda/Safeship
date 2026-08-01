// Fetch the signed-in user's repositories from GitHub. Shared by the dashboard
// (pick a repo to scan) and the advisor (pick a repo to analyze).

import { unstable_cache } from "next/cache";

export interface Repo {
  id: number;
  fullName: string;
  private: boolean;
  url: string;
  updatedAt: string | null;
  language: string | null;
}

interface GithubRepo {
  id: number;
  full_name: string;
  private: boolean;
  clone_url: string;
  updated_at: string | null;
  language: string | null;
}

export async function fetchRepos(
  token: string,
): Promise<{ repos: Repo[]; error: string | null }> {
  try {
    const res = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "safeship",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) {
      return { repos: [], error: `GitHub returned ${res.status}. Try signing out and back in.` };
    }
    const raw = (await res.json()) as GithubRepo[];
    return {
      repos: raw.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        private: r.private,
        url: r.clone_url,
        updatedAt: r.updated_at,
        language: r.language,
      })),
      error: null,
    };
  } catch {
    return { repos: [], error: "Could not reach GitHub. Check your connection." };
  }
}

/**
 * Cached per user for a short window, so navigating back and forth between the
 * dashboard and advisor doesn't hit GitHub for 100 repos every single time.
 *
 * The cache is keyed by userId ONLY (never the token, which stays in the closure)
 * — so one user's repos can never be served to another.
 */
export function fetchReposCached(
  userId: string,
  token: string,
): Promise<{ repos: Repo[]; error: string | null }> {
  return unstable_cache(() => fetchRepos(token), ["user-repos", userId], {
    revalidate: 60,
    tags: [`repos:${userId}`],
  })();
}
