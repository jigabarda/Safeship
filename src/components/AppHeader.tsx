import { SignOutButton } from "./AuthButtons";
import { Logo } from "./Logo";
import { NavTabs } from "./NavTabs";

/**
 * The signed-in header: logo, section tabs, and account actions. Shared by every
 * authenticated page so navigation is identical everywhere.
 *
 * Stays a server component so it can render the sign-out server action; the tabs
 * themselves are a client component (they need the current path).
 */
export function AppHeader({
  username,
  containerClass = "max-w-6xl",
}: {
  username?: string | null;
  /** Match the page's own content width so the header lines up with it. */
  containerClass?: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-background/80 backdrop-blur">
      <div
        className={`mx-auto flex h-14 w-full ${containerClass} items-center gap-4 px-6 sm:gap-6`}
      >
        <Logo />
        <NavTabs />
        <div className="ml-auto flex items-center gap-4">
          {username && (
            <span className="hidden text-sm text-muted sm:inline">{username}</span>
          )}
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
