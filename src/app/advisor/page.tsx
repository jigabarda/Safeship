import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { Advisor } from "@/components/Advisor";
import { fetchRepos } from "@/lib/github/repos";

export default async function AdvisorPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/dashboard");

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

      <main className="animate-in mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Advisor</h1>
          <p className="mt-1 text-muted">
            Visualize a repository&apos;s database schema as an ER diagram, or have the AI review
            its schema design, tech stack, and optimization opportunities. Advice and diagrams —
            not a security scan.
          </p>
        </div>

        {error ? (
          <p className="rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/25 dark:text-amber-300">
            {error}
          </p>
        ) : (
          <Advisor repos={repos} />
        )}
      </main>
    </>
  );
}
