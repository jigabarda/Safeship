import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { LlmSettingsForm, type LlmConfig } from "@/components/LlmSettingsForm";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/dashboard");

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  const username = user?.username ?? session.user.username ?? session.user.name ?? null;
  const avatarUrl = username ? `https://github.com/${username}.png?size=96` : null;

  const llmConfig: LlmConfig | null =
    user?.llmBaseUrl && user.llmModel
      ? {
          provider: user.llmProvider ?? "custom",
          baseUrl: user.llmBaseUrl,
          model: user.llmModel,
          hasKey: Boolean(user.llmApiKeyEnc),
        }
      : null;

  return (
    <>
      <AppHeader username={username} containerClass="max-w-5xl" />

      <main className="animate-in mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="flex max-w-2xl flex-col gap-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
            <p className="mt-1 text-muted">Manage your account and how Safeship uses AI.</p>
          </div>

          {/* Account */}
          <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Account</h2>
            <div className="mt-4 flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-2 text-lg font-medium text-muted">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  (username ?? "?").charAt(0).toUpperCase()
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium">{username ?? "Account"}</p>
                <p className="truncate text-sm text-muted">{user?.email ?? "No email on file"}</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted">
              Connected via GitHub. Safeship only reads your repositories — it never writes
              without opening a pull request you review.
            </p>
          </section>

          {/* AI model — bring your own */}
          <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-semibold">AI model</h2>
            <p className="mt-1 mb-4 text-sm text-muted">
              By default Safeship uses its built-in model. Bring your own OpenAI-compatible model
              (OpenAI, Groq, OpenRouter, or any compatible endpoint) to use it for scans, the
              advisor, and the assistant.
            </p>
            <LlmSettingsForm initial={llmConfig} />
          </section>
        </div>
      </main>
    </>
  );
}
