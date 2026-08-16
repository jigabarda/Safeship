"use client";

// Triggers the browser's print dialog, from which the user can Save as PDF.
// Hidden when printing (print:hidden) so it never lands in the exported page.
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.98] print:hidden"
    >
      Print / Save as PDF
    </button>
  );
}
