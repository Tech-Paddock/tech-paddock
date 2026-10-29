import ThemeControl, { LiveryBadge } from "./ThemeControl";
import LogoutControl from "./LogoutControl";
import { LIVERY } from "@/lib/livery";

/**
 * The app bar over the tabs (RULES.md, Surface: app): the name, theme, logout and the livery badge. No
 * meal count: the Meal pill already counts meals (TEC-193).
 */
export default function AppBar() {
  return (
    <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b-4 border-accent bg-bar px-3 py-2.5 text-bar-ink">
      <h1 className="text-lg font-semibold tracking-tight">Lando</h1>
      <ThemeControl onBar />
      <LogoutControl onBar />
      <div className="ml-auto flex items-center gap-2">
        <LiveryBadge livery={LIVERY} onBar />
      </div>
    </header>
  );
}
