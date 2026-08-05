"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Client-side because the active tab depends on the current path. Kept separate
// from AppHeader so the header itself can stay a server component (it renders
// the sign-out server action).
const TABS: Array<{ href: string; label: string; match: string[] }> = [
  { href: "/dashboard", label: "Dashboard", match: ["/dashboard"] },
  // Repositories holds the repo list AND their scan history; a report
  // (/scan/[id]) and the old /scans route both keep this tab active.
  { href: "/repositories", label: "Repositories", match: ["/repositories", "/scans", "/scan/"] },
  { href: "/advisor", label: "Advisor", match: ["/advisor"] },
  { href: "/assistant", label: "Assistant", match: ["/assistant"] },
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
                ? "rounded-full bg-surface-2 px-3.5 py-1.5 text-sm font-medium text-foreground ring-1 ring-inset ring-line"
                : "rounded-full px-3.5 py-1.5 text-sm font-medium text-muted hover:bg-surface-2/60 hover:text-foreground"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
