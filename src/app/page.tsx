import Link from "next/link";
import { SignInButton } from "@/components/AuthButtons";
import { Logo } from "@/components/Logo";

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
          <Logo />
          <Link
            href="/dashboard"
            className="text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            Dashboard →
          </Link>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col items-center overflow-hidden px-6">
        {/* Soft brand glow behind the hero. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-[32rem] w-[52rem] -translate-x-1/2 rounded-full opacity-[0.18] blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--brand), transparent)" }}
        />

        <div className="animate-in relative z-[1] flex w-full max-w-2xl flex-col items-center gap-8 py-20 text-center sm:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-brand shadow-sm">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
            Static code analysis only — we never attack anything
          </span>

          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
            Is your code
            <br className="hidden sm:block" /> <span className="text-brand">safe to ship?</span>
          </h1>

          <p className="max-w-xl text-lg leading-8 text-muted">
            Safeship is a security co-pilot for people who build with AI. Connect a
            GitHub repo and we&apos;ll scan it for leaked secrets, insecure code,
            and vulnerable dependencies — then explain every finding in plain
            English, ranked by real-world risk, with a copy-paste fix.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <SignInButton />
            <Link
              href="/dashboard"
              className="inline-flex h-12 items-center justify-center rounded-full border border-line-strong px-6 font-medium transition-colors hover:bg-surface-2"
            >
              Go to dashboard
            </Link>
          </div>
        </div>

        <ul className="relative z-[1] grid w-full max-w-4xl gap-4 pb-24 sm:grid-cols-3">
          <Feature
            icon={<IconEye />}
            title="Reads code only"
            body="No port scans, no live traffic, no exploitation. Ever."
          />
          <Feature
            icon={<IconChat />}
            title="Plain English"
            body="Written for people who've never heard of a CVE."
          />
          <Feature
            icon={<IconSpark />}
            title="100% free"
            body="Runs locally with open-source engines and a local AI model."
          />
        </ul>
      </main>
    </>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="rounded-xl border border-line bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
        {icon}
      </span>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </li>
  );
}

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <path
        d="M4 5.5h16v10H9l-4 3v-3H4v-10z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <path
        d="M12 3l1.8 4.9L18.7 9.7 13.8 11.5 12 16.4 10.2 11.5 5.3 9.7l4.9-1.8L12 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
