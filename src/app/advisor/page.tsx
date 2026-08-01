import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { Advisor, type RecentRun, type AdvisorToolValue } from "@/components/Advisor";
import { fetchRepos } from "@/lib/github/repos";
import type { SchemaModel } from "@/lib/schema/parse";

export default async function AdvisorPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/dashboard");

  const [user, runs] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id } }),
    db.advisorRun.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);
  const { repos, error } = user?.accessToken
    ? await fetchRepos(user.accessToken)
    : { repos: [], error: "No GitHub token on file — please sign in again." };

  const recent: RecentRun[] = runs.map((r) => ({
    id: r.id,
    repoFullName: r.repoFullName,
    tool: r.tool as AdvisorToolValue,
    rating: r.rating as RecentRun["rating"],
    headline: r.headline,
    markdown: r.markdown,
    model: (r.model as unknown as SchemaModel | null) ?? null,
    filesConsidered: (r.filesConsidered as unknown as string[]) ?? [],
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <>
      <AppHeader
        username={session.user.username ?? session.user.name}
        containerClass="max-w-4xl"
      />

      <main className="animate-in mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Advisor</h1>
          <p className="mt-1 text-muted">
            Have the AI review a repository&apos;s schema design, tech stack, or optimization
            opportunities. The schema review also draws your tables and relationships so you can
            see what to fix. Advice — not a security scan.
          </p>
        </div>

        {error ? (
          <p className="rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/25 dark:text-amber-300">
            {error}
          </p>
        ) : (
          <Advisor repos={repos} recent={recent} />
        )}
      </main>
    </>
  );
}
