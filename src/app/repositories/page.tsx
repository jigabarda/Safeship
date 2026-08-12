import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { RepoList } from "@/components/RepoList";
import { ScanList } from "@/components/ScanList";
import { fetchReposCached } from "@/lib/github/repos";
import { failStaleScans } from "@/lib/scan/staleScans";
import { getRepoLatestScores } from "@/lib/scan/history";

export default async function RepositoriesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/dashboard");
  const userId = session.user.id;

  const user = await db.user.findUnique({ where: { id: userId } });
  const [reposResult, , scans, repoScores] = await Promise.all([
    user?.accessToken
      ? fetchReposCached(userId, user.accessToken)
      : Promise.resolve({ repos: [], error: "No GitHub token on file — please sign in again." }),
    failStaleScans(userId),
    db.scan.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 }),
    getRepoLatestScores(userId),
  ]);
  const { repos, error } = reposResult;

  return (
    <>
      <AppHeader
        username={session.user.username ?? session.user.name}
        containerClass="max-w-5xl"
      />

      <main className="animate-in mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
          <p className="mt-1 text-muted">
            Pick a repository to scan, and see the scans you&apos;ve already run.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start">
          {/* Pick a repo to scan */}
          <section className="flex min-w-0 flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Your repositories</h2>
              {!error && <span className="text-sm text-muted">{repos.length} found</span>}
            </div>
            {error ? (
              <p className="rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/25 dark:text-amber-300">
                {error}
              </p>
            ) : (
              <RepoList repos={repos} scores={repoScores} />
            )}
          </section>

          {/* Recent scans — the history of those repos */}
          <aside className="flex min-w-0 flex-col gap-3 md:sticky md:top-20">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Recent scans</h2>
              {scans.length > 0 && (
                <span className="text-sm text-muted">
                  {scans.length} scan{scans.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {scans.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong bg-surface/50 px-4 py-8 text-center text-sm text-muted">
                No scans yet. Pick a repository and hit <strong>Scan</strong>.
              </p>
            ) : (
              <ScanList scans={scans} maxHeightClass="max-h-[calc(100vh-8rem)]" />
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
