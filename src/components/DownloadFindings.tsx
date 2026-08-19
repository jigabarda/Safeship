/**
 * Download the scan's findings as SARIF or CSV. Plain anchors rather than fetch
 * + blob: the route already sets Content-Disposition, so the browser handles
 * the save and nothing has to be held in memory.
 */
export function DownloadFindings({ scanId }: { scanId: string }) {
  const linkClass =
    "rounded-full border border-line px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-foreground";

  return (
    <div className="flex items-center gap-2 print:hidden">
      <a
        href={`/api/scan/${scanId}/export?format=sarif`}
        download
        title="SARIF 2.1.0 — upload to GitHub code scanning or another security tool"
        className={linkClass}
      >
        SARIF
      </a>
      <a
        href={`/api/scan/${scanId}/export?format=csv`}
        download
        title="CSV — open in a spreadsheet or import into a ticket tracker"
        className={linkClass}
      >
        CSV
      </a>
    </div>
  );
}
