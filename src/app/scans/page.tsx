import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { failStaleScans } from "@/lib/scan/staleScans";
import { scoreMeta } from "@/lib/ui";

export default async function ScansPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/dashboard");

  // Clean up scans abandoned by a lost runner before listing them.
  await failStaleScans(session.user.id);

  const scans = await db.scan.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <>
      <AppHeader
        username={session.user.username ?? session.user.name}
        containerClass="max-w-4xl"
      />

      <main className="animate-in mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scans</h1>
          <p className="mt-1 text-muted">Every scan you&apos;ve run, newest first.</p>
        </div>

        {scans.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface/50 px-4 py-12 text-center text-sm text-muted">
            No scans yet. Pick a repository from{" "}
            <Link
              href="/dashboard"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Repositories
            </Link>{" "}
            and hit <strong>Scan</strong>.
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
      : "bg-surface-2 text-muted"; // done (scoreless) or cancelled
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${cls}`}
    >
      {status}
    </span>
  );
}
