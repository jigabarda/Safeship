import Link from "next/link";
import { Logo } from "./Logo";
import { NavTabs } from "./NavTabs";
import { ProfileMenu } from "./ProfileMenu";
import { ThemeToggle } from "./ThemeToggle";

/**
 * The signed-in header: logo, section tabs, and the account avatar menu. Shared
 * by every authenticated page so navigation is identical everywhere.
 */
export function AppHeader({
  username,
  containerClass = "max-w-6xl",
}: {
  username?: string | null;
  /** Match the page's own content width so the header lines up with it. */
  containerClass?: string;
}) {
  // GitHub serves each user's avatar at github.com/<login>.png.
  const avatarUrl = username ? `https://github.com/${username}.png?size=64` : null;

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-background/80 backdrop-blur">
      <div
        className={`mx-auto flex h-14 w-full ${containerClass} items-center gap-4 px-6 sm:gap-6`}
      >
        <Logo />
        <NavTabs />
        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/repositories"
            aria-label="Scan a repository"
            title="Scan a repository"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden>
              <path
                d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
              <path d="M4 12h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </Link>
          <ThemeToggle />
          <span className="mx-1.5 h-5 w-px bg-line" aria-hidden />
          <ProfileMenu username={username} avatarUrl={avatarUrl} />
        </div>
      </div>
    </header>
  );
}
