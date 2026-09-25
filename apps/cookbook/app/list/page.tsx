import type { Metadata } from "next";
import Shell from "../Shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paddock — Cookbook · King Soopers list",
};

/**
 * The King Soopers list, at an address of its own (TEC-22).
 *
 * **Health depends on this path, so it is not renamed quietly.** Health's `/list`
 * redirects to `https://cookbook.techpaddock.io/list` while the grocery list
 * moves here (TEC-15); moving this route breaks that redirect.
 *
 * Signed out, `middleware.ts` sends you to `/login?from=/list` and the login
 * brings you back here, so the redirect survives a login in between.
 */
export default function ListPage() {
  return <Shell tab="shop" />;
}
