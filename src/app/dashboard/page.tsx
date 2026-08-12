import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { SignInButton } from "@/components/AuthButtons";
import { LocalTime } from "@/components/LocalTime";
import { fetchReposCached } from "@/lib/github/repos";
import { failStaleScans } from "@/lib/scan/staleScans";
import { getRepoLatestScores } from "@/lib/scan/history";
import { scoreMeta } from "@/lib/ui";

const SEVERITIES = [
  { key: "critical", label: "Critical", bar: "bg-rose-500" },
  { key: "high", label: "High", bar: "bg-orange-500" },
  { key: "medium", label: "Medium", bar: "bg-amber-400" },
  { key: "low", label: "Low", bar: "bg-zinc-400 dark:bg-zinc-500" },
] as const;

const RATING_DOT: Record<string, string> = {
  good: "bg-emerald-500",
  fair: "bg-amber-500",
  poor: "bg-rose-500",
};

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

  const userId = session.user.id;
  const user = await db.user.findUnique({ where: { id: userId } });

  const [reposResult, , scanCount, severityGroups, recentReviews, repoScores] = await Promise.all([
    user?.accessToken
      ? fetchReposCached(userId, user.accessToken)
      : Promise.resolve({ repos: [], error: "No GitHub token on file — please sign in again." }),
    failStaleScans(userId),
    db.scan.count({ where: { userId } }),
    db.finding.groupBy({
      by: ["severity"],
      where: { scan: { userId } },
      _count: { _all: true },
    }),
    db.advisorRun.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    getRepoLatestScores(userId),
  ]);
  const { repos, error } = reposResult;

  // Scanned repos, lowest score first — a triage list of what needs attention.
  const rankedRepos = Object.entries(repoScores)
    .map(([repoFullName, s]) => ({ repoFullName, ...s }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 6);

  // Tally findings by severity.
  const sev: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  let findingCount = 0;
  for (const g of severityGroups) {
    findingCount += g._count._all;
    if (g.severity in sev) sev[g.severity] = g._count._all;
  }
  const needsAttention = sev.critical + sev.high;
  const maxSev = Math.max(1, sev.critical, sev.high, sev.medium, sev.low);

  return (
    <>
      <AppHeader
        username={session.user.username ?? session.user.name}
        containerClass="max-w-5xl"
      />

      <main className="animate-in mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hi {session.user.username ?? session.user.name ?? "there"}
          </h1>
          <p className="mt-1 text-muted">
            Your security overview — scan a repo, review its design, or ask the assistant anything.
          </p>
        </div>

        {/* At-a-glance stats */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Repositories" value={error ? "—" : repos.length} />
          <StatTile label="Scans run" value={scanCount} />
          <StatTile label="Findings" value={findingCount} />
          <StatTile
            label="Needs attention"
            value={needsAttention}
            tone="danger"
            hint="critical + high"
          />
        </section>

        {/* Posture + activity */}
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* Findings by severity */}
          <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Findings by severity</h2>
            {findingCount === 0 ? (
              <p className="flex flex-1 items-center justify-center py-6 text-center text-sm text-muted">
                No findings yet — run a scan to see your security posture here.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {SEVERITIES.map((s) => (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-sm text-muted">{s.label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={`h-full rounded-full ${s.bar}`}
                        style={{ width: `${(sev[s.key] / maxSev) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-sm font-medium tabular-nums">
                      {sev[s.key]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Advisor reviews */}
          <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent reviews</h2>
              <Link
                href="/advisor"
                className="text-xs font-medium text-muted underline underline-offset-2 hover:text-foreground"
              >
                Open Advisor →
              </Link>
            </div>
            {recentReviews.length === 0 ? (
              <p className="flex flex-1 items-center justify-center py-6 text-center text-sm text-muted">
                No reviews yet — the Advisor can review your schema, stack, and optimizations.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {recentReviews.map((r) => (
                  <li key={r.id}>
                    <Link
                      href="/advisor"
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${RATING_DOT[r.rating] ?? "bg-muted"}`} />
                      <span className="min-w-0 flex-1 truncate text-sm">{r.repoFullName}</span>
                      <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                        {r.tool}
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        <LocalTime iso={r.createdAt.toISOString()} withTime={false} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Repositories by score — worst first, for triage */}
        {rankedRepos.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Repositories by score</h2>
              <Link
                href="/repositories"
                className="text-xs font-medium text-muted underline underline-offset-2 hover:text-foreground"
              >
                All repositories →
              </Link>
            </div>
            <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
              {rankedRepos.map((r) => (
                <li key={r.repoFullName}>
                  <Link
                    href={`/scan/${r.latestScanId}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{r.repoFullName}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {r.delta !== null && r.delta !== 0 && (
                        <span
                          className={`text-xs font-medium tabular-nums ${
                            r.delta > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {r.delta > 0 ? "▲+" : "▼"}
                          {r.delta}
                        </span>
                      )}
                      <span
                        className={`rounded-full bg-surface-2 px-2.5 py-1 text-sm font-semibold tabular-nums ${scoreMeta(r.score).text}`}
                      >
                        {r.score}
                        <span className="text-muted">/100</span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* What you can do */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Explore</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FeatureCard
              href="/repositories"
              title="Scan a repository"
              body="Find leaked secrets, insecure code, and vulnerable dependencies — explained in plain English."
              icon={
                <path
                  d="M4 6a2 2 0 012-2h8l6 6v8a2 2 0 01-2 2H6a2 2 0 01-2-2V6z M14 4v6h6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  fill="none"
                />
              }
            />
            <FeatureCard
              href="/advisor"
              title="Advisor"
              body="AI review of your schema, tech stack, and optimization opportunities — with a diagram."
              icon={
                <path
                  d="M12 3l2.5 5.5L20 10l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1.5L12 3z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  fill="none"
                />
              }
            />
            <FeatureCard
              href="/assistant"
              title="Assistant"
              body="Ask about a finding or your code and get plain-English answers and fixes."
              icon={
                <path
                  d="M4 6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H9l-4 3v-3H6a2 2 0 01-2-2V6z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  fill="none"
                />
              }
            />
          </div>
        </section>
      </main>
    </>
  );
}

function StatTile({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "danger";
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span
        className={`text-2xl font-semibold tabular-nums ${
          tone === "danger" && value !== 0 && value !== "—"
            ? "text-rose-600 dark:text-rose-400"
            : "text-foreground"
        }`}
      >
        {value}
      </span>
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </div>
  );
}

function FeatureCard({
  href,
  title,
  body,
  icon,
}: {
  href: string;
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 shadow-sm transition-colors hover:border-line-strong hover:bg-surface-2/40"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          {icon}
        </svg>
      </span>
      <span className="mt-1 flex items-center gap-1 font-medium">
        {title}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-4 w-4 -translate-x-1 text-muted opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
          aria-hidden
        >
          <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-sm text-muted">{body}</span>
    </Link>
  );
}
