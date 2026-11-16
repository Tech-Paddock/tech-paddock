import AppBar from "../AppBar";
import More from "../More";

export const dynamic = "force-dynamic";

/** Goals and lists: the same nouns, one step out from Today. */
export default function Page() {
  return (
    <main className="min-h-screen">
      <AppBar />
      <More />
    </main>
  );
}
