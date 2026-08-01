import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { AssistantChat, type ConversationSummary } from "@/components/AssistantChat";

export default async function AssistantPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/dashboard");

  const conversationRows = await db.conversation.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, title: true, updatedAt: true },
  });
  const conversations: ConversationSummary[] = conversationRows.map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <>
      <AppHeader
        username={session.user.username ?? session.user.name}
        containerClass="max-w-5xl"
      />

      <main className="animate-in mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-3xl">Assistant</h1>
          <p className="mt-1 text-muted">
            Ask about security, a specific finding, or your code. Replies stream in, and your
            past chats are saved on the left.
          </p>
        </div>

        <AssistantChat conversations={conversations} />
      </main>
    </>
  );
}
