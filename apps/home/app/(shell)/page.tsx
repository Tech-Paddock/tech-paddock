import Landing from "../Landing";
import { loadGlance } from "@/lib/glance";
import { loadPitWall } from "@/lib/pitwall";

/**
 * The hub is a top-level dashboard rather than a launcher.
 *
 * The glance is fetched here, on the server, so it is on the page when the page
 * arrives — a dashboard you have to watch load is a dashboard you stop opening.
 * The topbar and sidebar come from this group's layout; only the body is here.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Both in parallel: neither should wait on the other to render.
  const [glance, pit] = await Promise.all([loadGlance(), loadPitWall()]);
  return <Landing glance={glance} pit={pit} />;
}
