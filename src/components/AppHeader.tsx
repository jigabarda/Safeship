import { Logo } from "./Logo";
import { NavTabs } from "./NavTabs";
import { ProfileMenu } from "./ProfileMenu";

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
        <div className="ml-auto flex items-center">
          <ProfileMenu username={username} avatarUrl={avatarUrl} />
        </div>
      </div>
    </header>
  );
}
