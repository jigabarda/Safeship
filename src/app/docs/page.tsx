import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Documentation · Safeship",
  description: "How to use Safeship — scanning, reports, fixes, the AI co-pilot, and privacy.",
};

const TOC = [
  { id: "introduction", label: "Introduction" },
  { id: "getting-started", label: "Getting started" },
  { id: "the-report", label: "Understanding your report" },
  { id: "fixing-issues", label: "Fixing issues" },
  { id: "advisor", label: "Advisor" },
  { id: "assistant", label: "Assistant" },
  { id: "byo-model", label: "Bring your own model" },
  { id: "privacy", label: "Privacy & safety" },
  { id: "troubleshooting", label: "Troubleshooting" },
  { id: "faq", label: "FAQ" },
];

export default function DocsPage() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <Logo />
          <div className="flex items-center gap-5 text-sm font-medium text-muted">
            <Link href="/" className="transition-colors hover:text-foreground">
              Home
            </Link>
            <Link href="/dashboard" className="transition-colors hover:text-foreground">
              Dashboard →
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-10 px-6 py-10">
        {/* Table of contents */}
        <aside className="hidden w-52 shrink-0 lg:block">
          <nav className="sticky top-20 flex flex-col gap-1">
            <span className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              On this page
            </span>
            {TOC.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className="rounded-md px-2 py-1 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                {t.label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 max-w-3xl flex-1">
          <p className="text-sm font-medium text-brand">Documentation</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Using Safeship</h1>
          <p className="mt-2 text-lg text-muted">
            Everything you need to scan a repository, read the results, and fix what matters.
          </p>

          <Doc id="introduction" title="Introduction">
            <P>
              Safeship is a security co-pilot for developers — especially people building with AI
              who aren&apos;t security experts. Connect a GitHub repository and Safeship scans it for
              leaked secrets, insecure code, and vulnerable dependencies, then explains every finding
              in plain English with a suggested fix.
            </P>
            <P>
              It performs <strong className="text-foreground">static analysis only</strong>: it reads
              your code, it never attacks anything, and it never changes your code without opening a
              pull request you review.
            </P>
          </Doc>

          <Doc id="getting-started" title="Getting started">
            <Ol>
              <li>
                <strong className="text-foreground">Sign in with GitHub.</strong> Safeship requests
                access to read your repositories and to open pull requests for the one-click fixes.
              </li>
              <li>
                <strong className="text-foreground">Pick a repository.</strong> On the{" "}
                <Code>Repositories</Code> tab, choose any repo — public or private — and press{" "}
                <Code>Scan</Code>.
              </li>
              <li>
                <strong className="text-foreground">Wait a moment.</strong> Your repo is cloned into a
                temporary sandbox, and three open-source engines run over it: Gitleaks (secrets),
                Semgrep (insecure code), and OSV (vulnerable dependencies).
              </li>
              <li>
                <strong className="text-foreground">Read the report.</strong> Findings are grouped and
                ranked; open any one for a plain-English explanation and a fix.
              </li>
            </Ol>
          </Doc>

          <Doc id="the-report" title="Understanding your report">
            <P>Each scan produces a report with a few signals:</P>
            <Ul>
              <li>
                <strong className="text-foreground">Safety score (0–100).</strong> A quick overall
                signal computed from the findings&apos; severity — higher is safer.
              </li>
              <li>
                <strong className="text-foreground">Severity.</strong> critical / high / medium / low
                — the technical seriousness reported by the engine.
              </li>
              <li>
                <strong className="text-foreground">Priority.</strong> fix now / should fix / minor —
                Safeship&apos;s plain-language read on real-world urgency.
              </li>
              <li>
                <strong className="text-foreground">Grouping.</strong> View findings by priority, by
                area (backend / frontend / data / config), or by the engine that found them, and
                search to focus.
              </li>
            </Ul>
          </Doc>

          <Doc id="fixing-issues" title="Fixing issues">
            <P>
              Open any finding to see <Code>What it means</Code> and a <Code>Suggested fix</Code>,
              both written for non-experts.
            </P>
            <Ul>
              <li>
                <strong className="text-foreground">Fix with AI.</strong> For a fixable file, Safeship
                generates the change and opens a pull request on a new branch. You review and merge —
                it never pushes to your default branch.
              </li>
              <li>
                <strong className="text-foreground">Batch fix.</strong> Select several findings and
                open a single pull request that addresses them together.
              </li>
            </Ul>
          </Doc>

          <Doc id="advisor" title="Advisor">
            <P>Beyond scanning, the Advisor reviews how your project is built:</P>
            <Ul>
              <li>
                <strong className="text-foreground">Schema.</strong> Reads your database schema and
                migrations, suggests improvements, and draws an entity-relationship diagram of your
                tables and relationships. Supports Prisma, SQL, and Rails.
              </li>
              <li>
                <strong className="text-foreground">Stack.</strong> Reviews your technology choices
                and flags risks or better fits.
              </li>
              <li>
                <strong className="text-foreground">Optimize.</strong> Points out performance and
                structure improvements.
              </li>
            </Ul>
            <P>
              For schema reviews you can <Code>Apply</Code> the recommendations as a reviewable pull
              request — editing the schema file for Prisma/SQL, or adding a new migration for Rails.
            </P>
          </Doc>

          <Doc id="assistant" title="Assistant">
            <P>
              The Assistant is a chat for security and coding questions. Ask about a specific finding,
              a concept (&quot;what is SQL injection?&quot;), or your own code. Replies stream in as
              they&apos;re written, and your conversations are saved so you can pick them back up.
            </P>
          </Doc>

          <Doc id="byo-model" title="Bring your own model">
            <P>
              By default every feature uses Safeship&apos;s built-in model. In{" "}
              <Code>Settings → AI model</Code> you can add your own OpenAI-compatible models — OpenAI,
              Groq, OpenRouter, or any compatible endpoint — then choose which model each feature
              uses.
            </P>
            <P>
              Point everything at one model, or use a different model per feature (explanations,
              advisor, assistant, fixes) to manage cost and rate limits. Your API key is{" "}
              <strong className="text-foreground">stored encrypted</strong>, never shown again, and
              used only for your requests.
            </P>
          </Doc>

          <Doc id="privacy" title="Privacy & safety">
            <Ul>
              <li>Static analysis only — no port scans, no live traffic, no exploitation.</li>
              <li>Your code is scanned in a temporary sandbox and never stored.</li>
              <li>Secrets are redacted before anything is sent to the AI.</li>
              <li>
                Safeship only writes through pull requests you review and merge — never to your
                default branch.
              </li>
            </Ul>
            <p className="mt-2 font-medium text-foreground">What Safeship keeps</p>
            <Ul>
              <li>
                <strong className="text-foreground">Saved to your account:</strong> your scans and
                their findings, Advisor reviews, and Assistant conversations — so you can revisit
                them.
              </li>
              <li>
                <strong className="text-foreground">Not kept:</strong> your source code. It&apos;s
                scanned in a temporary sandbox and discarded afterward.
              </li>
              <li>
                If you add your own AI model, the API key is stored encrypted and used only for your
                requests.
              </li>
            </Ul>
          </Doc>

          <Doc id="troubleshooting" title="Troubleshooting">
            <Ul>
              <li>
                <strong className="text-foreground">A scan is stuck or failed.</strong> Scans run in
                the background; one that loses its runner is marked failed automatically — just start
                it again. Very large repositories take longer.
              </li>
              <li>
                <strong className="text-foreground">No findings.</strong> Often good news. It can also
                mean the repo has no files the engines recognize — Safeship reports only what
                Gitleaks, Semgrep, and OSV detect.
              </li>
              <li>
                <strong className="text-foreground">Explanations or fixes are slow.</strong> The AI is
                generating them; each explanation is cached after the first time. Bring your own
                faster model in <Code>Settings</Code> if you like.
              </li>
              <li>
                <strong className="text-foreground">&quot;Save &amp; test&quot; fails for a model.</strong>{" "}
                Check the base URL, model name, and API key — the message shown is the provider&apos;s
                own error.
              </li>
              <li>
                <strong className="text-foreground">A fix was skipped.</strong> Some files can&apos;t
                be auto-fixed (for example, dependency lockfiles). Apply the suggested fix manually in
                those cases.
              </li>
              <li>
                <strong className="text-foreground">GitHub permission errors.</strong> Sign out and
                back in to refresh Safeship&apos;s access to your repositories.
              </li>
            </Ul>
          </Doc>

          <Doc id="faq" title="FAQ">
            <Faq q="Is it really free?">
              Yes — Safeship runs on open-source engines and free infrastructure, with no paid API and
              no credit card. If you prefer a premium model, you can plug in your own API key.
            </Faq>
            <Faq q="What can it scan?">
              Any GitHub repository you can access, public or private, across most popular languages.
            </Faq>
            <Faq q="Do you need write access to my repo?">
              Only to open pull requests for fixes you choose to apply. Scanning itself only reads.
            </Faq>
            <Faq q="Will it change my code?">
              Only if you ask. Every change arrives as a pull request on a new branch for you to
              review — nothing is pushed to your default branch.
            </Faq>
          </Doc>

          <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-line pt-6 text-sm">
            <Link href="/dashboard" className="font-medium text-foreground hover:underline">
              Go to the dashboard →
            </Link>
            <a
              href="https://github.com/jigabarda/Safeship/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted transition-colors hover:text-foreground"
            >
              Report a problem
            </a>
          </div>
        </main>
      </div>
    </>
  );
}

function Doc({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-20 border-t border-line pt-8 first:border-t-0">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="leading-relaxed text-muted">{children}</p>;
}

function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5 leading-relaxed text-muted">{children}</ul>;
}

function Ol({ children }: { children: React.ReactNode }) {
  return (
    <ol className="flex list-decimal flex-col gap-2 pl-5 leading-relaxed text-muted">{children}</ol>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="font-medium">{q}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}
