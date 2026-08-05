// A static mock of a scan finding, styled like the real report. Used on the
// landing page and in the docs so people can see what a result looks like.
export function ReportPreview() {
  return (
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
  );
}
