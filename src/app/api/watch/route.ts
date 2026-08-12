import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// Add or remove a repo from the user's auto-rescan watch list. Watching is fully
// opt-in and per-repo; nothing is scanned automatically until a repo is watched.

const watchSchema = z.object({
  repoFullName: z.string().min(1),
  repoUrl: z.string().url(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = watchSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  await db.watchedRepo.upsert({
    where: {
      userId_repoFullName: {
        userId: session.user.id,
        repoFullName: parsed.repoFullName,
      },
    },
    create: {
      userId: session.user.id,
      repoFullName: parsed.repoFullName,
      repoUrl: parsed.repoUrl,
    },
    update: { repoUrl: parsed.repoUrl },
  });

  return Response.json({ watched: true });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  let repoFullName: string;
  try {
    ({ repoFullName } = z.object({ repoFullName: z.string().min(1) }).parse(await request.json()));
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  await db.watchedRepo.deleteMany({
    where: { userId: session.user.id, repoFullName },
  });

  return Response.json({ watched: false });
}
