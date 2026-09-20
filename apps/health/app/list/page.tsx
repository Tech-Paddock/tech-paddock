import Link from "next/link";
import ThemeControl, { LiveryBadge } from "../ThemeControl";
import List from "./List";
import { LIVERY } from "@/lib/livery";

export const dynamic = "force-dynamic";

/**
 * The grocery list.
 *
 * A second product screen, which the charter did not allow when it was written.
 * Joel approved the amendment that makes one legitimate on 2026-09-19 — a
 * screen is earned by being a different *moment*, never a different noun — and
 * that, rather than the fact this exists, is what licenses it. Like `/debug`,
 * it needs no `middleware.ts` edit: the matcher is a catch-all negative, so it
 * is behind the password gate already.
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
