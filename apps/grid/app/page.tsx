import AppBar from "./AppBar";
import Today from "./Today";

export const dynamic = "force-dynamic";

/** Today: the app bar, then the one screen (RULES.md, Surface: app). */
export default function Page() {
  return (
    <main className="min-h-screen">
      <AppBar />
      <Today />
    </main>
  );
}
