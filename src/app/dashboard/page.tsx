import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { SignInButton } from "@/components/AuthButtons";
import { RepoList } from "@/components/RepoList";
import { ScanList } from "@/components/ScanList";
import { fetchRepos } from "@/lib/github/repos";
import { failStaleScans } from "@/lib/scan/staleScans";

const RECENT_SCAN_COUNT = 6;

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

  // Clean up any abandoned scans, then load a handful of the most recent to show
  // right here on the dashboard (with a link to the full history).
  await failStaleScans(session.user.id);
  const [recentScans, scanCount] = await Promise.all([
    db.scan.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: RECENT_SCAN_COUNT,
    }),
    db.scan.count({ where: { userId: session.user.id } }),
  ]);

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

        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Recent scans</h2>
            {scanCount > RECENT_SCAN_COUNT && (
              <Link
                href="/scans"
                className="text-sm font-medium text-muted underline underline-offset-4 transition-colors hover:text-foreground"
              >
                View all ({scanCount})
              </Link>
            )}
          </div>
          {recentScans.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong bg-surface/50 px-4 py-8 text-center text-sm text-muted">
              No scans yet. Pick a repository above and hit <strong>Scan</strong>.
            </p>
          ) : (
            <ScanList scans={recentScans} />
          )}
        </section>
      </main>
    </>
  );
}
