import Link from "next/link";
import { SignInButton } from "@/components/AuthButtons";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl flex flex-col gap-8">
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Static code analysis only — we never attack anything
        </div>

        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight">
          Is your code{" "}
          <span className="text-emerald-600 dark:text-emerald-400">
            safe to ship?
          </span>
        </h1>

        <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Safeship is a security co-pilot for people who build with AI. Connect a
          GitHub repo and we&apos;ll scan it for leaked secrets, insecure code,
          and vulnerable dependencies — then explain every finding in plain
          English, ranked by real-world risk, with a copy-paste fix.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <SignInButton />
          <Link
            href="/dashboard"
            className="inline-flex h-12 items-center justify-center rounded-full border border-black/[.1] dark:border-white/[.15] px-6 font-medium transition-colors hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          >
            Go to dashboard
          </Link>
        </div>

        <ul className="grid sm:grid-cols-3 gap-4 pt-4 text-sm">
          <Feature title="Reads code only" body="No port scans, no live traffic, no exploitation. Ever." />
          <Feature title="Plain English" body="Written for people who've never heard of a CVE." />
          <Feature title="100% free" body="Runs locally with open-source engines and a local AI model." />
        </ul>
      </div>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <li className="rounded-xl border border-black/[.08] dark:border-white/[.1] p-4">
      <p className="font-semibold mb-1">{title}</p>
      <p className="text-zinc-600 dark:text-zinc-400">{body}</p>
    </li>
  );
}

