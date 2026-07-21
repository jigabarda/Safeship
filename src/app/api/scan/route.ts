import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { dispatchScanWorkflow } from "@/lib/scan/dispatch";
import { recordScanStep } from "@/lib/scan/recordStep";

const bodySchema = z.object({
  repoFullName: z.string().min(1),
  repoUrl: z.string().url(),
});

/**
 * Kick off a scan. Creates a Scan row (status=queued), triggers the GitHub
 * Actions scan workflow (which runs the engines on a runner and POSTs findings
 * back to /api/scan/callback), and returns immediately. The client polls
 * GET /api/scan/[id] for progress.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const scan = await db.scan.create({
    data: {
      userId: session.user.id,
      repoFullName: parsed.repoFullName,
      repoUrl: parsed.repoUrl,
    },
  });

  await recordScanStep(scan.id, "starting");

  // Local dev (SCAN_MODE=local): run the scan inline using the engines installed on
  // this machine, instead of dispatching to a GitHub Actions runner. A cloud runner
  // can't POST results back to localhost, so inline is how you test the full flow
  // locally. The dynamic import keeps the engine deps out of the prod serverless bundle.
  if ((process.env.SCAN_MODE ?? "dispatch") === "local") {
    const { runScan } = await import("@/lib/scan/runScan");
    void runScan(scan.id).catch((e) => {
      console.error(`[scan ${scan.id}] local run failed:`, e);
    });
    return Response.json({ id: scan.id, status: "running" }, { status: 202 });
  }

  // Strip any trailing slash so a stray one in APP_URL can't produce a
  // "//api/scan/callback" that Vercel 308-redirects (which breaks the callback).
  const base = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/+$/, "");
  const callbackUrl = `${base}/api/scan/callback`;
  const progressUrl = `${base}/api/scan/progress`;

  try {
    await dispatchScanWorkflow({
      scanId: scan.id,
      repoUrl: parsed.repoUrl,
      callbackUrl,
      progressUrl,
    });
  } catch (e) {
    console.error(`[scan ${scan.id}] dispatch failed:`, e);
    await db.scan.update({
      where: { id: scan.id },
      data: {
        status: "failed",
        error: "Could not start the scan. Please try again.",
        finishedAt: new Date(),
      },
    });
    return Response.json({ error: "Could not start the scan" }, { status: 502 });
  }

  // Dispatch accepted — the workflow is starting.
  await db.scan.update({
    where: { id: scan.id },
    data: { status: "running" },
  });

  return Response.json({ id: scan.id, status: "running" }, { status: 202 });
}
