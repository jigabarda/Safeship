import { db } from "@/lib/db";
import { dispatchScanWorkflow } from "@/lib/scan/dispatch";
import { recordScanStep } from "@/lib/scan/recordStep";

// Scheduled re-scan of every watched repo. Invoked by Vercel Cron (see
// vercel.json). Gated by CRON_SECRET so only the scheduler can trigger it — with
// no secret set, it refuses to run, keeping auto-scanning off by default.

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const base = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/+$/, "");
  const callbackUrl = `${base}/api/scan/callback`;
  const progressUrl = `${base}/api/scan/progress`;

  const watched = await db.watchedRepo.findMany();
  let dispatched = 0;
  let failed = 0;

  for (const w of watched) {
    try {
      const scan = await db.scan.create({
        data: {
          userId: w.userId,
          repoFullName: w.repoFullName,
          repoUrl: w.repoUrl,
        },
      });
      await recordScanStep(scan.id, "starting");
      await dispatchScanWorkflow({
        scanId: scan.id,
        repoUrl: w.repoUrl,
        callbackUrl,
        progressUrl,
      });
      await db.scan.update({ where: { id: scan.id }, data: { status: "running" } });
      dispatched++;
    } catch (e) {
      failed++;
      console.error(`[cron rescan] ${w.repoFullName} failed:`, (e as Error).message);
    }
  }

  return Response.json({ watched: watched.length, dispatched, failed });
}
