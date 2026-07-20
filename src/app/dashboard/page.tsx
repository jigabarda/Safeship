import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { SignInButton, SignOutButton } from "@/components/AuthButtons";
import { RepoList, type Repo } from "@/components/RepoList";
import { Logo } from "@/components/Logo";
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

  const scans = await db.scan.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const engines = await checkEngines();
  const missingEngines = engines.filter((e) => !e.available);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-6">
          <Logo />
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted sm:inline">
              {session.user.username ?? session.user.name}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="animate-in mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hi {session.user.username ?? session.user.name ?? "there"} 👋
          </h1>
          <p className="mt-1 text-muted">
            Pick a repository to scan for leaked secrets and vulnerable dependencies.
          </p>
        </div>

        {missingEngines.length > 0 && (
          <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm dark:border-amber-800/60 dark:bg-amber-950/25">
            <p className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
              <IconWarn />
              {missingEngines.length} scan engine
              {missingEngines.length === 1 ? " is" : "s are"} not installed
            </p>
            <p className="mt-1 text-amber-800/80 dark:text-amber-300/80">
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
          <h2 className="text-lg font-semibold">Past scans</h2>
          {scans.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong bg-surface/50 px-4 py-8 text-center text-sm text-muted">
              No scans yet. Pick a repo above and hit <strong>Scan</strong>.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
              {scans.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/scan/${s.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.repoFullName}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {new Date(s.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {typeof s.score === "number" ? (
                      <span
                        className={`shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-sm font-semibold tabular-nums ${scoreMeta(s.score).text}`}
                      >
                        {s.score}
                        <span className="text-muted">/100</span>
                      </span>
                    ) : (
                      <StatusBadge status={s.status} />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const running = status === "queued" || status === "running";
  const failed = status === "failed";
  const cls = failed
    ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
    : running
      ? "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
      : "bg-surface-2 text-muted";
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}

function IconWarn() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
      <path
        d="M12 3.5l9 15.5H3l9-15.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="0.9" fill="currentColor" />
    </svg>
  );
}
