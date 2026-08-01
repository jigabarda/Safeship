import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { AssistantChat } from "@/components/AssistantChat";

export default async function AssistantPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/dashboard");

  return (
    <>
      <AppHeader
        username={session.user.username ?? session.user.name}
        containerClass="max-w-4xl"
      />

      <main className="animate-in mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assistant</h1>
          <p className="mt-1 text-muted">
            Ask about security, a specific finding, or your code. Answers only — it
            never runs or changes anything.
          </p>
        </div>

        <div className="flex min-h-[60vh] flex-1 flex-col">
          <AssistantChat />
        </div>
      </main>
    </>
  );
}
