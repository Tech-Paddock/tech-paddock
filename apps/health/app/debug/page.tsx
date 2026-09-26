import Link from "next/link";
import ThemeControl, { LiveryBadge } from "../ThemeControl";
import LogoutControl from "../LogoutControl";
import Harness from "./Harness";
import { LIVERY } from "@/lib/livery";

export const dynamic = "force-dynamic";

/**
 * The debug harness, on its own route.
 *
 * **It needs no `middleware.ts` edit and must never need one.** The matcher is
 * a catch-all negative — `/((?!_next/static|_next/image).*)` — so this route
 * sits behind the password gate automatically. That file is the password gate
 * and is the technical director's; a design that never has to touch it is worth
 * more than any convenience that would.
 */
export default function Page() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center gap-2 border-b-4 border-accent bg-bar px-4 py-3 text-bar-ink">
        <h1 className="text-lg font-semibold tracking-tight">
          <Link href="/" className="opacity-70">Health</Link>
          <span className="opacity-50"> / </span>
          Model comparison
        </h1>
        <ThemeControl onBar />
        <LogoutControl onBar />
        <div className="ml-auto flex items-center gap-2">
          <LiveryBadge livery={LIVERY} onBar />
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-5">
        <Harness />
      </div>
    </main>
  );
}
