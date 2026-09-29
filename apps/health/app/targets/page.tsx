import Link from "next/link";
import ThemeControl, { LiveryBadge } from "../ThemeControl";
import LogoutControl from "../LogoutControl";
import TargetsForm from "./TargetsForm";
import { LIVERY } from "@/lib/livery";

export const dynamic = "force-dynamic";

/**
 * Setting the day's target — a second screen, reached from a quiet footer link
 * and never a tab (Joel, 2026-09-29). Setting a budget is a different moment
 * from logging a meal, which is the charter's test for a second screen; what is
 * left of it shows on the log screen, where it is read.
 *
 * Like `/debug`, it needs no `middleware.ts` edit: the matcher is a catch-all
 * negative, so this route is behind the password gate already.
 */
export default function Page() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center gap-2 border-b-4 border-accent bg-bar px-4 py-3 text-bar-ink">
        <h1 className="text-lg font-semibold tracking-tight">
          <Link href="/" className="opacity-70">Health</Link>
          <span className="opacity-50"> / </span>
          Targets
        </h1>
        <ThemeControl onBar />
        <LogoutControl onBar />
        <div className="ml-auto flex items-center gap-2">
          <LiveryBadge livery={LIVERY} onBar />
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-5">
        <TargetsForm />
      </div>
    </main>
  );
}
