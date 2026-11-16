import ThemeControl from "./ThemeControl";
import LogoutControl from "./LogoutControl";

/** The app bar: the name, then theme and logout. Nothing else sits on it. */
export default function AppBar() {
  return (
    <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b-4 border-accent bg-bar px-3 py-2.5 text-bar-ink">
      <h1 className="text-lg font-semibold">Grid</h1>
      <div className="ml-auto flex items-center gap-2">
        <ThemeControl onBar />
        <LogoutControl onBar />
      </div>
    </header>
  );
}
