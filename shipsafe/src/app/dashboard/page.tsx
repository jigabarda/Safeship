import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { SignInButton, SignOutButton } from "@/components/AuthButtons";
import { RepoList, type Repo } from "@/components/RepoList";
import { checkEngines } from "@/lib/engines/availability";
import { scoreMeta } from "@/lib/ui";

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
        <div className="max-w-md flex flex-col items-center gap-6">
          <h1 className="text-3xl font-semibold tracking-tight">Sign in to scan your repos</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Safeship reads your code to check it for leaked secrets and vulnerable
            dependencies. It only reads — it never attacks anything.
          </p>
          <SignInButton />
          <Link href="/" className="text-sm text-zinc-500 hover:underline">
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

  const scans = await db.scan.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const engines = await checkEngines();
  const missingEngines = engines.filter((e) => !e.available);

  return (
    <main className="flex flex-1 flex-col w-full max-w-4xl mx-auto px-6 py-10 gap-10">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:underline">
            Safeship
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">
            Hi {session.user.username ?? session.user.name ?? "there"} 👋
          </h1>
        </div>
        <SignOutButton />
      </header>

      {missingEngines.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            {missingEngines.length} scan engine
            {missingEngines.length === 1 ? " is" : "s are"} not installed
          </p>
          <p className="text-amber-800/80 dark:text-amber-300/80 mt-1">
            Scans still run with whatever is available, but you&apos;ll get more
            complete results after installing:
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {missingEngines.map((e) => (
              <li key={e.engine} className="text-amber-800/90 dark:text-amber-300/90">
                <span className="font-mono font-medium">{e.label}</span> — {e.purpose}.{" "}
                <span className="opacity-80">{e.installHint}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Your repositories</h2>
          <span className="text-sm text-zinc-500">{repos.length} found</span>
        </div>
        {error ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-300">
            {error}
          </p>
        ) : (
          <RepoList repos={repos} />
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Past scans</h2>
        {scans.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No scans yet. Pick a repo above and hit <strong>Scan</strong>.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/[.06] dark:divide-white/[.08] rounded-xl border border-black/[.08] dark:border-white/[.1]">
            {scans.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/scan/${s.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-black/[.03] dark:hover:bg-white/[.04] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{s.repoFullName}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(s.createdAt).toLocaleString()} · {s.status}
                    </p>
                  </div>
                  {typeof s.score === "number" ? (
                    <span
                      className={`shrink-0 text-sm font-semibold tabular-nums ${scoreMeta(s.score).text}`}
                    >
                      {s.score}/100
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-zinc-500">{s.status}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
