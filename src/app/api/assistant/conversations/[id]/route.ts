import { auth } from "@/auth";
import { db } from "@/lib/db";

// Load one conversation's messages so the client can reopen it. Owner-only.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = await db.conversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation || conversation.userId !== session.user.id) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  return Response.json({
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map((m) => ({ role: m.role, content: m.content })),
  });
}

// Delete a conversation from history. Owner-only.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = await db.conversation.findUnique({ where: { id } });
  if (!conversation || conversation.userId !== session.user.id) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  await db.conversation.delete({ where: { id } });
  return Response.json({ ok: true });
}
