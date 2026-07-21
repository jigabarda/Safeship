import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { SignInButton } from "@/components/AuthButtons";
import { RepoList, type Repo } from "@/components/RepoList";

interface GithubRepo {
  id: number;
  full_name: string;
  private: boolean;
  clone_url: string;
  updated_at: string | null;
  language: string | null;
}

async function fetchRepos(token: string): Promise<{ repos: Repo[]; error: string | null }> {
  try {
    const res = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return { repos: [], error: `GitHub returned ${res.status}. Try signing out and back in.` };
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

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex max-w-md flex-col items-center gap-6 rounded-2xl border border-line bg-surface p-10 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-tight">Sign in to scan your repos</h1>
          <p className="text-muted">
            Safeship reads your code to check it for leaked secrets and vulnerable
            dependencies. It only reads — it never attacks anything.
          </p>
          <SignInButton />
          <Link href="/" className="text-sm text-muted transition-colors hover:text-foreground">
            ← Back home
          </Link>
        </div>
      </main>
    );
  }

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  const { repos, error } = user?.accessToken
    ? await fetchRepos(user.accessToken)
    : { repos: [], error: "No GitHub token on file — please sign in again." };

  return (
    <>
      <AppHeader
        username={session.user.username ?? session.user.name}
        containerClass="max-w-4xl"
      />

      <main className="animate-in mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hi {session.user.username ?? session.user.name ?? "there"} 👋
          </h1>
          <p className="mt-1 text-muted">
            Pick a repository to scan for leaked secrets and vulnerable dependencies.
          </p>
        </div>

        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Your repositories</h2>
            <span className="text-sm text-muted">{repos.length} found</span>
          </div>
          {error ? (
            <p className="rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/25 dark:text-amber-300">
              {error}
            </p>
          ) : (
            <RepoList repos={repos} />
          )}
        </section>

        <p className="text-sm text-muted">
          Looking for a previous result? See{" "}
          <Link
            href="/scans"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Scans
          </Link>
          .
        </p>
      </main>
    </>
  );
}
