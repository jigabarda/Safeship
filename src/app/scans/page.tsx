import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { ScanList } from "@/components/ScanList";
import { failStaleScans } from "@/lib/scan/staleScans";

export default async function ScansPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/dashboard");

  // Clean up abandoned scans and load the list together.
  const [, scans] = await Promise.all([
    failStaleScans(session.user.id),
    db.scan.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <>
      <AppHeader
        username={session.user.username ?? session.user.name}
        containerClass="max-w-4xl"
      />

      <main className="animate-in mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-3xl">Scans</h1>
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
          <ScanList scans={scans} />
        )}
      </main>
    </>
  );
}
