import { auth } from "@/auth";
import { db } from "@/lib/db";

// A short list of the user's latest scans, for the header activity menu.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Not signed in" }, { status: 401 });

  const scans = await db.scan.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { id: true, repoFullName: true, status: true, score: true, createdAt: true },
  });

  return Response.json({
    scans: scans.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
  });
}
