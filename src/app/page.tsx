import Link from "next/link";
import { auth } from "@/auth";
import { SignInButton } from "@/components/AuthButtons";
import { Logo } from "@/components/Logo";

const BTN_PRIMARY =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground px-6 font-medium text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.98]";

export default async function Home() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-6">
          <Logo />
          <nav className="mx-auto hidden items-center gap-7 text-sm font-medium text-muted md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#advisor" className="transition-colors hover:text-foreground">AI co-pilot</a>
            <a href="#safety" className="transition-colors hover:text-foreground">Safety</a>
            <Link href="/docs" className="transition-colors hover:text-foreground">Docs</Link>
          </nav>
          <div className="ml-auto flex items-center gap-4 md:ml-0">
            {signedIn ? (
              <Link
                href="/dashboard"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-medium text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
              >
                Open dashboard →
              </Link>
            ) : (
              <>
                <Link
                  href="/dashboard"
                  className="hidden text-sm font-medium text-muted transition-colors hover:text-foreground sm:inline"
                >
                  Dashboard
                </Link>
                <SignInButton label="Sign in" compact />
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col items-center overflow-hidden px-6">
        {/* Soft brand glow behind the hero. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-[32rem] w-[52rem] -translate-x-1/2 rounded-full opacity-[0.18] blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--brand), transparent)" }}
        />

        {/* Hero */}
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
            Safeship is a security co-pilot for people who build with AI. Connect a GitHub repo and
            we&apos;ll scan it for leaked secrets, insecure code, and vulnerable dependencies — then
            explain every finding in plain English, ranked by real-world risk, with a copy-paste fix.
          </p>

          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              {signedIn ? (
                <Link href="/dashboard" className={BTN_PRIMARY}>
                  Go to your dashboard →
                </Link>
              ) : (
                <>
                  <SignInButton />
                  <Link
                    href="/dashboard"
                    className="inline-flex h-12 items-center justify-center rounded-full border border-line-strong px-6 font-medium transition-colors hover:bg-surface-2"
                  >
                    Go to dashboard
                  </Link>
                </>
              )}
            </div>
            {!signedIn && (
              <p className="text-xs text-muted">Free · open-source engines · no credit card</p>
            )}
          </div>
        </div>

        {/* Product preview */}
        <HeroPreview />

        {/* What it catches */}
        <Section
          id="features"
          eyebrow="What it catches"
          title="Three ways your code leaks risk"
          subtitle="Every scan runs three trusted, open-source engines — so nothing common slips through."
        >
          <ul className="grid w-full gap-4 sm:grid-cols-3">
            <Feature
              icon={<IconKey />}
              title="Leaked secrets"
              body="API keys, tokens, and passwords accidentally committed to your repo."
            />
            <Feature
              icon={<IconPackage />}
              title="Vulnerable dependencies"
              body="Known CVEs in the open-source packages your project depends on."
            />
            <Feature
              icon={<IconCode />}
              title="Insecure code"
              body="SQL injection, unsafe eval, weak crypto, and other risky patterns."
            />
          </ul>
          <p className="mt-6 text-center text-xs text-muted">
            Powered by Gitleaks · Semgrep · OSV
          </p>
        </Section>

        {/* How it works */}
        <Section
          id="how"
          eyebrow="How it works"
          title="From repo to fixes in minutes"
          subtitle="No config, no agents to install, nothing to learn."
        >
          <ol className="grid w-full gap-4 sm:grid-cols-3">
            <Step
              n={1}
              title="Connect"
              body="Sign in with GitHub and pick any repository — public or private."
            />
            <Step
              n={2}
              title="Scan"
              body="Safeship runs trusted engines over your code in a temporary sandbox."
            />
            <Step
              n={3}
              title="Fix"
              body="Get findings ranked by real-world risk, each with a plain-English fix — or open a pull request in one click."
            />
          </ol>
        </Section>

        {/* More than a scanner */}
        <Section
          id="advisor"
          eyebrow="More than a scanner"
          title="An AI security co-pilot"
          subtitle="Beyond finding issues, Safeship helps you understand and fix them."
        >
          <ul className="grid w-full gap-4 sm:grid-cols-2">
            <Feature
              icon={<IconDiagram />}
              title="Advisor"
              body="AI reviews your database schema, tech stack, and optimizations — and draws your tables and relationships so you can see what to fix."
            />
            <Feature
              icon={<IconChat />}
              title="Assistant"
              body="Ask about any finding or your code and get clear, streaming answers — no security jargon required."
            />
            <Feature
              icon={<IconWand />}
              title="One-click fixes"
              body="Turn a finding into a reviewed pull request on a new branch. You approve every change."
            />
            <Feature
              icon={<IconModel />}
              title="Bring your own model"
              body="Prefer GPT-4o or Claude? Plug in your own API key — the same model everywhere, or a different one per feature."
            />
          </ul>
        </Section>

        {/* Safety */}
        <Section
          id="safety"
          eyebrow="Safe by default"
          title="It only ever reads — never attacks"
          subtitle="Security tooling you can point at your own code without worry."
        >
          <ul className="grid w-full gap-3 sm:grid-cols-2">
            <SafetyPromise text="Static analysis only — no port scans, no live traffic, no exploitation." />
            <SafetyPromise text="Your code is scanned in a temporary sandbox and never stored." />
            <SafetyPromise text="Secrets are redacted before anything is sent to the AI." />
            <SafetyPromise text="It only writes through pull requests you review and merge." />
          </ul>
        </Section>

        {/* FAQ */}
        <Section eyebrow="FAQ" title="Questions, answered">
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <FaqItem
              q="Is it really free?"
              a="Yes — open-source engines and free infrastructure, no paid API and no credit card. Prefer a premium model? You can plug in your own API key."
            />
            <FaqItem
              q="Do you store my code?"
              a="No. Your repo is scanned in a temporary sandbox and discarded — nothing is kept. Secrets are redacted before anything reaches the AI."
            />
            <FaqItem
              q="What can it scan?"
              a="Any GitHub repository you can access, public or private, across most popular languages — for leaked secrets, vulnerable dependencies, and insecure code."
            />
            <FaqItem
              q="Will it change my code?"
              a="Only if you ask. Fixes open as pull requests on a new branch for you to review — Safeship never pushes to your main branch."
            />
          </div>
        </Section>

        {/* Final CTA */}
        <div className="relative z-[1] my-20 flex w-full max-w-3xl flex-col items-center gap-6 rounded-2xl border border-line bg-surface px-6 py-14 text-center shadow-sm">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Ready to see what&apos;s in your code?
          </h2>
          <p className="max-w-md text-muted">
            {signedIn
              ? "Pick a repository and get a fresh security report in a couple of minutes."
              : "Connect a repository and get your first security report in a couple of minutes. It's free."}
          </p>
          {signedIn ? (
            <Link href="/repositories" className={BTN_PRIMARY}>
              Scan a repository →
            </Link>
          ) : (
            <SignInButton />
          )}
        </div>
      </main>
    </>
  );
}

function HeroPreview() {
  return (
    <div className="animate-in relative z-[1] w-full max-w-2xl pb-20">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-line bg-surface-2/60 px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          </span>
          <span className="ml-1 font-mono text-xs text-muted">safeship · report</span>
          <span className="ml-auto font-mono text-xs">
            <span className="text-rose-500">64</span>
            <span className="text-muted">/100</span>
          </span>
        </div>

        {/* One finding, styled like the real report */}
        <div className="p-5 text-left">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 font-medium text-amber-600 dark:text-amber-400">
              High
            </span>
            <span className="flex items-center gap-1 font-medium text-rose-500">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Fix now
            </span>
          </div>

          <p className="mt-2.5 font-semibold">
            Hardcoded API key committed to <span className="font-mono text-sm">config.ts</span>
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-muted">config.ts</span>
            <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-muted">gitleaks</span>
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">What it means</p>
          <p className="mt-1 text-sm text-muted">
            A secret key is committed to your repository — anyone who can read the code can use it to
            access your service. Rotate the key and load it from an environment variable instead.
          </p>

          <div className="mt-4 overflow-hidden rounded-lg border border-line bg-background">
            <div className="border-b border-line px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Suggested fix
            </div>
            <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">
              <span className="text-rose-500">- const key = &quot;sk_live_9f2c8a1b…&quot;;</span>
              {"\n"}
              <span className="text-emerald-500">+ const key = process.env.API_KEY;</span>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="relative z-[1] w-full max-w-4xl scroll-mt-20 py-14">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand">{eyebrow}</span>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        {subtitle && <p className="max-w-xl text-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
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

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 text-left shadow-sm">
      <p className="font-medium">{q}</p>
      <p className="mt-1.5 text-sm text-muted">{a}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <span className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
        {n}
      </span>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </li>
  );
}

function SafetyPromise({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-sm shadow-sm">
      <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden>
        <path
          d="M5 12.5l4 4 10-10.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-foreground/90">{text}</span>
    </li>
  );
}

function IconKey() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <circle cx="8" cy="15" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 12.5L20 3M17 6l2 2M14 9l2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPackage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function IconCode() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13 5l-2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <path d="M4 5.5h16v10H9l-4 3v-3H4v-10z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function IconDiagram() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <rect x="3" y="4" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14" y="15" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.5 9v4.5a2 2 0 002 2H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconWand() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <path d="M5 19L15 9M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2zM18.5 9.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconModel() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <rect x="4" y="8" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 8V5.5a3 3 0 016 0V8M9 13h.01M15 13h.01M9.5 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
