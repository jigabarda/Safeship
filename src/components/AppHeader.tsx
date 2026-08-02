import Link from "next/link";
import { Logo } from "./Logo";
import { NavTabs } from "./NavTabs";
import { ProfileMenu } from "./ProfileMenu";
import { ThemeToggle } from "./ThemeToggle";

const ICON_BTN =
  "flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground";

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
          <a
            href="https://github.com/jigabarda/Safeship"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View Safeship on GitHub"
            title="View Safeship on GitHub"
            className={ICON_BTN}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-[18px] w-[18px]" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          <Link href="/settings" aria-label="Settings" title="Settings" className={ICON_BTN}>
            <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden>
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.2.61.77 1.03 1.42 1.03H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
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
