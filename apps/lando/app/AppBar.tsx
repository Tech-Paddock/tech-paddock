import ThemeControl, { LiveryBadge } from "./ThemeControl";
import LogoutControl from "./LogoutControl";
import ProfileButton from "./ProfileButton";
import { LIVERY } from "@/lib/livery";

/**
 * The app bar over the tabs (RULES.md, Surface: app): the app's icon (it opens Profile, TEC-260; the name is kept for screen readers), theme, logout and the livery badge. No
 * meal count: the Meal pill already counts meals (TEC-193).
 */
export default function AppBar() {
  return (
    <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b-4 border-accent bg-bar px-3 py-2.5 text-bar-ink">
      <ProfileButton />
      <h1 className="sr-only">Lando</h1>
      <ThemeControl onBar />
      <LogoutControl onBar />
      <div className="ml-auto flex items-center gap-2">
        <LiveryBadge livery={LIVERY} onBar />
      </div>
    </header>
  );
}
