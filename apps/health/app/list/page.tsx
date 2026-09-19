import Link from "next/link";
import ThemeControl, { LiveryBadge } from "../ThemeControl";
import List from "./List";
import { LIVERY } from "@/lib/livery";

export const dynamic = "force-dynamic";

/**
 * The grocery list.
 *
 * A second product screen, which the charter did not allow when it was written
 * — the amendment proposed in this change is what makes it legitimate, rather
 * than the fact that it now exists. Like `/debug`, it needs no `middleware.ts`
 * edit: the matcher is a catch-all negative, so it is behind the password gate
 * already.
 */
export default function Page() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center gap-2 border-b-4 border-accent bg-bar px-4 py-3 text-bar-ink">
        <h1 className="text-lg font-semibold tracking-tight">
          <Link href="/" className="opacity-70">Health</Link>
          <span className="opacity-50"> / </span>
          List
        </h1>
        <ThemeControl onBar />
        <div className="ml-auto flex items-center gap-2">
          <LiveryBadge livery={LIVERY} onBar />
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-5">
        <List />
      </div>
    </main>
  );
}
