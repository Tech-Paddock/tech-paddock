import { Suspense } from "react";
import { loadGlance } from "@/lib/glance";
import { loadPitWall } from "@/lib/pitwall";
import { APPS, selectedIndexFrom } from "../apps";
import GlancePanel from "../GlancePanel";
import { Frame, Tabs, Waiting, densityFrom, tabFrom, type Density } from "../Landing";
import Paper from "../Paper";
import PitWall from "../PitWall";

/**
 * Home is a top-level dashboard rather than a launcher.
 *
 * Data is fetched on the server so it arrives with the page, but **only what the
 * current view shows, and never before the view itself**: a framed tool needs
 * none of it, the Paper needs the glance, the Pit Wall tab needs both. Each load
 * sits in its own Suspense boundary, so the tab strip is on screen at once and
 * one slow source holds up only its own panel.
 */
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

const one = (params: Params, key: string) => {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
};

async function PaperLoaded({ density }: { density: Density }) {
  return <Paper glance={await loadGlance()} density={density} />;
}

async function PitWallLoaded() {
  return <PitWall data={await loadPitWall()} />;
}

async function GlanceLoaded() {
  return <GlancePanel glance={await loadGlance()} />;
}

export default function HomePage({ searchParams }: { searchParams: Params }) {
  const selected = selectedIndexFrom(one(searchParams, "app"));
  if (selected !== null) return <Frame app={APPS[selected]} />;

  const tab = tabFrom(one(searchParams, "tab"));
  const density = densityFrom(one(searchParams, "density"));

  return (
    <Tabs tab={tab} density={density}>
      {tab === "paper" ? (
        <Suspense fallback={<Waiting on="each tool for its summary" />}>
          <PaperLoaded density={density} />
        </Suspense>
      ) : (
        <div className="landing">
          <Suspense fallback={<Waiting on="GitHub" />}>
            <PitWallLoaded />
          </Suspense>
          <Suspense fallback={<Waiting on="each tool for its summary" />}>
            <GlanceLoaded />
          </Suspense>
        </div>
      )}
    </Tabs>
  );
}
