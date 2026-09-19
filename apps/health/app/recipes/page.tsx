import Link from "next/link";
import ThemeControl, { LiveryBadge } from "../ThemeControl";
import Book from "./Book";
import { LIVERY } from "@/lib/livery";

export const dynamic = "force-dynamic";

/**
 * The recipe book.
 *
 * A third screen under the rule Joel approved on 2026-09-19: **a screen earns
 * its place by being a different moment, not a different noun.** Deciding what
 * to cook, and writing down how, is not the moment you are in while logging
 * lunch — so it is a footer link off the log rather than a tab, the same as
 * `/list` and `/debug`.
 *
 * Like them it needs no `middleware.ts` edit: the matcher is a catch-all
 * negative, so this and `/api/recipes/*` sit behind the password gate already.
 */
export default function Page() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center gap-2 border-b-4 border-accent bg-bar px-4 py-3 text-bar-ink">
        <h1 className="text-lg font-semibold tracking-tight">
          <Link href="/" className="opacity-70">Health</Link>
          <span className="opacity-50"> / </span>
          Recipes
        </h1>
        <ThemeControl onBar />
        <div className="ml-auto flex items-center gap-2">
          <LiveryBadge livery={LIVERY} onBar />
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-5">
        <Book />
      </div>
    </main>
  );
}
