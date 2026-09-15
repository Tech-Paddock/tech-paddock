import Landing from "../Landing";
import { loadGlance } from "@/lib/glance";

/**
 * The hub is a top-level dashboard rather than a launcher.
 *
 * The glance is fetched here, on the server, so it is on the page when the page
 * arrives — a dashboard you have to watch load is a dashboard you stop opening.
 * The topbar and sidebar come from this group's layout; only the body is here.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const glance = await loadGlance();
  return <Landing glance={glance} />;
}
