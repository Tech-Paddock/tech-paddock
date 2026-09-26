import { Suspense } from "react";
import { loadPitWall } from "@/lib/linear";
import { groupingFrom, type Grouping } from "@/lib/pitgroups";
import { APPS, selectedIndexFrom } from "../apps";
import Garage from "../Garage";
import { Frame, Tabs, Waiting, tabFrom } from "../Landing";
import PitWall from "../PitWall";

/**
 * Home: the Pit Wall and The Garage, as tabs, with every tool a sidebar click
 * away in a frame.
 *
 * Data is fetched on the server so it arrives with the page, but **only what the
 * current view shows, and never before the view itself**: a framed tool needs
 * none of it, the Pit Wall needs Linear, The Garage its probes. Each load sits
 * in its own Suspense boundary, so the tab strip is on screen at once and one
 * slow source holds up only its own panel.
 */
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

const one = (params: Params, key: string) => {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
};

async function PitWallLoaded({ group }: { group: Grouping }) {
  return <PitWall data={await loadPitWall()} group={group} />;
}

export default function HomePage({ searchParams }: { searchParams: Params }) {
  const selected = selectedIndexFrom(one(searchParams, "app"));
  if (selected !== null) return <Frame app={APPS[selected]} />;

  const tab = tabFrom(one(searchParams, "tab"));

  return (
    <Tabs tab={tab}>
      {tab === "garage" ? (
        <Suspense fallback={<Waiting on="every project" />}>
          <Garage />
        </Suspense>
      ) : (
        <Suspense fallback={<Waiting on="Linear" />}>
          <PitWallLoaded group={groupingFrom(one(searchParams, "group"))} />
        </Suspense>
      )}
    </Tabs>
  );
}
