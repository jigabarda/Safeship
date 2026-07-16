import { auth } from "@/auth";
import { db } from "@/lib/db";

export interface RepoSummary {
  id: number;
  fullName: string;
  private: boolean;
  url: string;
  defaultBranch: string;
  updatedAt: string | null;
  language: string | null;
}

interface GithubRepo {
  id: number;
  full_name: string;
  private: boolean;
  clone_url: string;
  default_branch: string;
  updated_at: string | null;
  language: string | null;
}

/** List the signed-in user's GitHub repositories (most recently updated first). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user?.accessToken) {
    return Response.json({ error: "No GitHub token on file" }, { status: 401 });
  }

  const res = await fetch(
    "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
    {
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      // Never cache another user's private repo list.
      cache: "no-store",
    },
  );

  if (!res.ok) {
    return Response.json(
      { error: "GitHub API error", status: res.status },
      { status: 502 },
    );
  }

  const repos = (await res.json()) as GithubRepo[];
  const summary: RepoSummary[] = repos.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    private: r.private,
    url: r.clone_url,
    defaultBranch: r.default_branch,
    updatedAt: r.updated_at,
    language: r.language,
  }));

  return Response.json({ repos: summary });
}
