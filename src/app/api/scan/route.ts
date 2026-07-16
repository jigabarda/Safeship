import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { runScan } from "@/lib/scan/runScan";

const bodySchema = z.object({
  repoFullName: z.string().min(1),
  repoUrl: z.string().url(),
});

/**
 * Kick off a scan. Creates a Scan row (status=queued), starts runScan in the
 * background (fire-and-forget — the Node process keeps running it), and returns
 * immediately. The client polls GET /api/scan/[id] for progress.
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

  // Fire-and-forget. runScan marks the row failed on error, so we just log here.
  void runScan(scan.id).catch((e) => {
    console.error(`[scan ${scan.id}] failed:`, e);
  });

  return Response.json({ id: scan.id, status: scan.status }, { status: 202 });
}
