import HomeShell from "./HomeShell";
import { loadGlance } from "@/lib/glance";

/**
 * The hub is now a top-level dashboard rather than a launcher.
 *
 * The glance is fetched here, on the server, so it is on the page when the page
 * arrives — a dashboard you have to watch load is a dashboard you stop opening.
 * The interactive shell below it stays a client component.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const glance = await loadGlance();
  return <HomeShell glance={glance} />;
}
