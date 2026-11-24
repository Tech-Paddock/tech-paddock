import AppBar from "./AppBar";
import Week from "./Week";

export const dynamic = "force-dynamic";

/** This week: the app bar, then the one screen (RULES.md, Surface: app). */
export default function Page() {
  return (
    <main className="min-h-screen">
      <AppBar />
      <Week />
    </main>
  );
}
