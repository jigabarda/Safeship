"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Client-side because the active tab depends on the current path. Kept separate
// from AppHeader so the header itself can stay a server component (it renders
// the sign-out server action).
const TABS: Array<{ href: string; label: string; match: string[] }> = [
  { href: "/dashboard", label: "Repositories", match: ["/dashboard"] },
  // A single report lives at /scan/[id], so it highlights the Scans tab too.
  { href: "/scans", label: "Scans", match: ["/scans", "/scan/"] },
];

export function NavTabs() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {TABS.map((tab) => {
        const active = tab.match.some(
          (m) => pathname === m || pathname.startsWith(m.endsWith("/") ? m : `${m}/`),
        );
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium text-foreground"
                : "rounded-full px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
