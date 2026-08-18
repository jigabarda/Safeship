import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { IgnoreRuleList, type IgnoreRuleRow } from "@/components/IgnoreRuleList";

export default async function IgnoredPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/dashboard");

  const rules = await db.ignoreRule.findMany({
    where: { userId: session.user.id },
    orderBy: [{ repoFullName: "asc" }, { createdAt: "desc" }],
  });

  const rows: IgnoreRuleRow[] = rules.map((r) => ({
    id: r.id,
    repoFullName: r.repoFullName,
    engine: r.engine,
    ruleId: r.ruleId,
    filePath: r.filePath,
    reason: r.reason,
    title: r.title,
    severity: r.severity,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <>
      <AppHeader
        username={session.user.username ?? session.user.name}
        containerClass="max-w-3xl"
      />

      <main className="animate-in mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Ignored findings</h1>
            <Link
              href="/repositories"
              className="text-sm font-medium text-muted underline underline-offset-2 transition-colors hover:text-foreground"
            >
              ← Repositories
            </Link>
          </div>
          <p className="mt-1 text-muted">
            Findings you&apos;ve dismissed as false positives, accepted risks, or
            won&apos;t-fix. They stay out of your reports and your score until you
            revoke them here.
          </p>
        </div>

        <IgnoreRuleList rules={rows} />
      </main>
    </>
  );
}
