"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downscale } from "@/lib/image";
import { LIVERY } from "@/lib/livery";
import ThemeControl, { LiveryBadge } from "./ThemeControl";
import { METHOD_LABELS, type BrewMethod } from "@/lib/methods";
import {
  percentToPpm,
  band,
  blankBrew,
  ratioFor,
  openingBrew,
  parseBrewTime,
  formatBrewTime,
  formatGrindSetting,
  withDose,
  withRatio,
  withWater,
  YIELD_TARGET,
  type BrewDraft,
  type BrewSource,
  type GuideNumbers,
} from "@/lib/brews";
import { MY_BREWERS, MY_BREWER_LABELS, GRINDERS, type MyBrewer } from "@/lib/brewers";
import type { Guide, GuideStatus } from "@/lib/guide";
import { guidePresentation, SUGGESTION_PRESENTATION } from "@/lib/guideDisplay";
import type { Suggestion } from "@/lib/suggestion";
import { roastDateFromLabel } from "@/lib/dates";
import { searchIsRunning, searchIsStale, SEARCH_START_GRACE_MS, STALE_SEARCH_MESSAGE } from "@/lib/searchClock";
import { changedFields, hasChanges, missingRequired } from "@/lib/patch";
import { MODEL_LABELS, DEFAULT_SEARCH_MODEL, DEFAULT_EFFORT, effortsFor, isEffortFor, type SearchModel } from "@/lib/models";

type Identity = {
  roaster: string | null;
  coffee_name: string | null;
  origin: string | null;
  process: string | null;
  varietal: string | null;
  roast_date: string | null;
};

type Bag = Identity & {
  id: string;
  photo_url: string | null;
  product_url: string | null;
  guide_url: string | null;
  guide_status: GuideStatus;
  guide_method: string | null;
  guide_ratio: string | null;
  guide_dose: string | null;
  guide_water: string | null;
  guide_temp: string | null;
  guide_grind: string | null;
  guide_time: string | null;
  guide_quotes: { field: string; text: string; url: string }[];
  guide_dropped: { field: string; value: string; reason: string }[];
  guide_model: string | null;
  guide_effort: string | null;
  guide_search_error: string | null;
  // Set while a search is in flight and cleared when it lands. It is how a
  // page that was not there when the search started can still tell "still
  // working" from "never ran".
  guide_search_started_at: string | null;
  // When a search last recorded an answer. It is how a poller tells "this run
  // finished, and here is a warning beside its answer" from "this run failed
  // and the answer on the row is an older one".
  guide_fetched_at: string | null;
  // Claude's own, for a bag whose roaster published none. Deliberately not a
  // guide_* value and never rendered as one.
  suggested_recipe: Suggestion | null;
  suggested_error: string | null;
  my_notes: string | null;
  purchased_date: string | null;
  created_at: string;
};

type Brew = {
  id: string;
  bag_id: string;
  brewed_at: string;
  brewer: string | null;
  brew_method: string | null;
  grinder: string | null;
  grind_setting: string | null;
  dose_g: string | number | null;
  water_g: string | number | null;
  beverage_g: string | number | null;
  tds_percent: string | number | null;
  extraction_yield: string | number | null;
  brew_seconds: number | null;
  rating: number | null;
  notes: string | null;
};

type PreviousBag = {
  id: string;
  brewer: string | null;
  brew_method: string | null;
  grinder: string | null;
  grind_setting: string | null;
  created_at: string;
};

const EMPTY: Identity = {
  roaster: "",
  coffee_name: "",
  origin: "",
  process: "",
  varietal: "",
  roast_date: "",
};

export default function CoffeePage() {
  // Scanning is an action you take occasionally; the library is the thing you
  // come back to. Two tabs gave them equal weight and hid one behind the
  // other — so the library is now the page, and scanning opens above it.
  const [scanning, setScanning] = useState(false);
  const [bags, setBags] = useState<Bag[]>([]);
  const [query, setQuery] = useState("");
  const [libraryError, setLibraryError] = useState<string | null>(null);
  // Which load is the latest. Typing "sweet" fires a request per pause, and
  // they can come back in any order; an older one landing last would put the
  // results for "swe" under a box that says "sweet".
  const latestLoad = useRef(0);

  const loadBags = useCallback(async (q: string) => {
    const ticket = ++latestLoad.current;
    // A failed load used to do nothing at all, which rendered as "No bags
    // yet. Scan one." — a confident statement about data that was never
    // read. An empty library and a broken one must not look the same.
    try {
      const res = await fetch(`/api/bags${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      const data = await res.json();
      if (ticket !== latestLoad.current) return;
      if (!res.ok) throw new Error(data.error ?? "Couldn't load the library.");
      setBags(data.bags ?? []);
      setLibraryError(null);
    } catch (e) {
      if (ticket !== latestLoad.current) return;
      setLibraryError(e instanceof Error ? e.message : "Couldn't load the library.");
      setBags([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadBags(query), query ? 250 : 0);
    return () => clearTimeout(t);
  }, [query, loadBags]);

  return (
    <main className="min-h-screen">
      <header className="bg-bar text-bar-ink px-4 py-3 flex items-center gap-2 border-b-4 border-accent">
        <span aria-hidden>☕</span>
        <h1 className="font-semibold">Coffee</h1>
        <ThemeControl onBar />
        <div className="ml-auto">
          <LiveryBadge livery={LIVERY} onBar />
        </div>
      </header>

      <div className="px-4 py-5 max-w-2xl mx-auto flex flex-col gap-5">
        <section className="bg-surface border border-line rounded-2xl overflow-hidden">
          <button
            onClick={() => setScanning((open) => !open)}
            aria-expanded={scanning}
            className="w-full flex items-center justify-between px-4 py-3 text-left font-medium"
          >
            Scan a bag
            <span aria-hidden className="text-accent text-xl leading-none">{scanning ? "−" : "+"}</span>
          </button>
          {scanning && (
            <div className="px-4 pb-4 border-t border-line pt-4">
              <Scan
                onSaved={() => {
                  setScanning(false);
                  void loadBags(query);
                }}
              />
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-medium">Shelf{bags.length ? ` (${bags.length})` : ""}</h2>
          <Library
            bags={bags}
            query={query}
            setQuery={setQuery}
            error={libraryError}
            onChanged={() => void loadBags(query)}
          />
        </section>
      </div>
    </main>
  );
}

function Scan({ onSaved }: { onSaved: () => void }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);
  // The row as it was last read back. The review screen edits against it
  // rather than against blanks, so "save" can tell a field that was changed
  // from one that was simply left alone.
  const [saved, setSaved] = useState<Bag | null>(null);
  const [purchase, setPurchase] = useState({ purchased_date: "", roast_date: "" });
  // What the label said where it could not be read as a date. Shown beside the
  // empty field, because a roast date nobody printed and one nobody could
  // parse are the same empty box and only one of them is an answer.
  const [labelRoastDate, setLabelRoastDate] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "reading" | "confirm" | "searching" | "review" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  // Said beside an answer the search did record, never instead of one.
  const [warning, setWarning] = useState<string | null>(null);
  const [previous, setPrevious] = useState<PreviousBag | null>(null);
  // The previous-purchase lookup failing is not "you have never had this".
  const [previousError, setPreviousError] = useState<string | null>(null);
  const [model, setModel] = useState<SearchModel>(DEFAULT_SEARCH_MODEL);
  const [effort, setEffort] = useState<string>(DEFAULT_EFFORT);
  const [bagId, setBagId] = useState<string | null>(null);
  const [waited, setWaited] = useState(0);

  async function pick(file: File) {
    setError(null);
    setStage("reading");
    try {
      const small = await downscale(file);
      setPhoto(small);
      setPreview(URL.createObjectURL(small));

      const body = new FormData();
      body.append("photo", small);
      const res = await fetch("/api/identify", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't read that photo.");

      // Blanks rather than nulls so every field is typeable: this screen is
      // also the manual-entry path when the photo can't be read.
      //
      // The roast date is the one field with a date column behind it, so the
      // label's wording becomes a date here or not at all — the input shows
      // only YYYY-MM-DD, and the save refuses anything else. What could not
      // be read is kept for the hint beside the field.
      const read = data.identity as Identity;
      const roast = roastDateFromLabel(read?.roast_date);
      setIdentity({ ...EMPTY, ...stripNulls(read), roast_date: roast.value });
      setLabelRoastDate(roast.unread);
      setStage("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setIdentity({ ...EMPTY });
      setLabelRoastDate(null);
      setStage("confirm");
    }
  }

  /**
   * Save the bag, then start the search against the saved row.
   *
   * The order is deliberate and it is the opposite of what this did before.
   * The search takes anywhere from thirty seconds to a few minutes and nothing
   * travels on the connection while it works, so a phone gives up and the
   * answer is lost even though the server finished it. Writing the row first
   * means the result has somewhere to land that is not this response.
   */
  async function findAndSave() {
    if (!identity?.roaster || !identity?.coffee_name) {
      setError("A roaster and a coffee name are needed to search.");
      return;
    }
    setError(null);
    setWarning(null);
    setWaited(0);
    setStage("searching");

    try {
      const body = new FormData();
      for (const [k, v] of Object.entries(identity)) if (v) body.append(k, v);
      if (photo) body.append("photo", photo);
      const res = await fetch("/api/bags", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save that bag.");

      const id = data.bag.id as string;
      setBagId(id);
      setSaved(data.bag as Bag);
      setPurchase({
        purchased_date: (data.bag.purchased_date as string) ?? "",
        roast_date: (data.bag.roast_date as string) ?? "",
      });

      // After the save, not beside it. Run alongside, the lookup could read
      // the library before this bag was in it or after — and once it is in,
      // "the most recent purchase of this coffee" is this one, which has no
      // brews, so a repeat purchase read as a first. Excluding the bag just
      // saved is what makes the answer about an earlier purchase.
      void lookForPrevious(identity.roaster, identity.coffee_name, id);

      // Fired, not awaited. This request routinely outlives the page's
      // patience, and its answer is read back off the row instead.
      void fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bag_id: id,
          roaster: identity.roaster,
          coffee_name: identity.coffee_name,
          model,
          // Sent only when this model has the control. Haiku 4.5 returns a
          // 400 for it rather than ignoring it.
          effort: isEffortFor(model, effort) ? effort : null,
        }),
      }).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the search.");
      setStage("confirm");
    }
  }

  async function lookForPrevious(roaster: string, coffeeName: string, exclude: string) {
    // The route reports a lookup that could not run as a 500, precisely so
    // it is not read as "no previous purchase". Dropping that response here
    // undid it: a broken lookup and a first-time coffee rendered the same.
    try {
      const res = await fetch(
        `/api/bags?roaster=${encodeURIComponent(roaster)}&coffee_name=${encodeURIComponent(coffeeName)}` +
          `&exclude=${encodeURIComponent(exclude)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The previous-purchase lookup failed.");
      setPrevious((data.previous as PreviousBag) ?? null);
      setPreviousError(null);
    } catch (e) {
      setPrevious(null);
      setPreviousError(e instanceof Error ? e.message : "The previous-purchase lookup failed.");
    }
  }

  // Poll the saved row. The search writes its answer there, so this survives
  // the request that started it being dropped, backgrounded or timed out.
  useEffect(() => {
    if (stage !== "searching" || !bagId) return;
    const started = Date.now();
    let seenRunning = false;

    const tick = async () => {
      setWaited(Math.round((Date.now() - started) / 1000));
      // No photo: this runs every four seconds and never shows one.
      const res = await fetch(`/api/bags/${bagId}?photo=0`);
      if (!res.ok) return;
      const bag = (await res.json()).bag as Bag;
      setSaved(bag);

      if (bag.guide_status !== "not_searched") {
        // An answer landed. Anything in the error column beside it is the
        // warning it was recorded with, not a failure.
        setGuide(guideFromBag(bag));
        setWarning(bag.guide_search_error);
        setStage("review");
        return;
      }
      if (bag.guide_search_error) {
        setError(bag.guide_search_error);
        setStage("review");
        return;
      }
      if (bag.guide_search_started_at) {
        seenRunning = true;
        // A stamp nothing can still be working under: the function was
        // stopped without reaching the line that records why.
        if (searchIsStale(bag.guide_search_started_at)) {
          setError(STALE_SEARCH_MESSAGE);
          setStage("review");
        }
        return;
      }
      // Neither running nor answered. Past the grace period, and never seen
      // running, the request that starts the search did not get through.
      if (!seenRunning && Date.now() - started > SEARCH_START_GRACE_MS) {
        setError("The search did not start. The bag is saved — run it again from the shelf with Search again.");
        setStage("review");
      }
    };

    const timer = setInterval(() => void tick(), 4000);
    return () => clearInterval(timer);
  }, [stage, bagId]);

  // Carrying a dial-in forward is a brew-level action now — the fields it
  // used to fill live on coffee.brews. Kept as a hint on the confirm screen
  // until the brew form can take it directly.
  async function save() {
    if (!bagId) return;

    // A bag is a purchase, so it needs the date you bought it. This is the
    // field that produced the original bug: leaving it alone sent an empty
    // patch, the route correctly refused it, and the page reported
    // **"Couldn't save that bag"** about a bag that had been in the library
    // for minutes. Naming the field is Joel's call over closing quietly —
    // an error you can act on beats both the old message and no message.
    const missing = missingRequired(purchase);
    if (missing) {
      setError(missing);
      return;
    }

    // Past that, nothing to change is still not a failure. The row exists and
    // the request simply is not made.
    const patch = changedFields(
      { purchased_date: saved?.purchased_date ?? "", roast_date: saved?.roast_date ?? "" },
      purchase
    );
    if (!hasChanges(patch)) {
      onSaved();
      return;
    }

    setStage("saving");
    setError(null);
    try {
      // The guide on the row was written by the search and is not editable
      // here by design. What is editable is the purchase: when you bought it,
      // and the roast date if the label's version of one could not be read.
      const res = await fetch(`/api/bags/${bagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save that bag.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
      setStage("review");
    }
  }

  if (stage === "idle") {
    return (
      <div className="flex flex-col gap-4">
        <label className="border-2 border-dashed border-line rounded-2xl bg-surface py-14 text-center cursor-pointer">
          {/* No `capture` attribute: on iOS that forces the camera and removes
              the photo library, and a bag you already photographed is a normal
              way to add one. */}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pick(f);
            }}
          />
          <span className="text-4xl block mb-3" aria-hidden>📷</span>
          <span className="font-medium">Photograph the bag</span>
          <span className="block text-sm text-ink/60 mt-1">or choose one from your photos</span>
        </label>
        <button
          onClick={() => {
            setIdentity({ ...EMPTY });
            setLabelRoastDate(null);
            setStage("confirm");
          }}
          className="text-sm text-ink/60 underline"
        >
          Enter a bag by hand instead
        </button>
      </div>
    );
  }

  if (stage === "reading") return <Busy label="Reading the bag…" />;
  if (stage === "searching") {
    return (
      <Busy
        label="Looking for the roaster's instructions…"
        hint={
          waited < 20
            ? "Checking this coffee's page, then their brew guide."
            : `${waited}s. The bag is already saved — this can finish without you, and the guide will be on it when you come back.`
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="text-sm text-urgent bg-surface border border-urgent rounded-lg px-3 py-2">{error}</p>}

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="The bag" className="rounded-xl w-full max-h-64 object-contain bg-surface border border-line" />
      )}

      <section className="bg-surface border border-line rounded-2xl p-4 flex flex-col gap-3">
        <h2 className="font-medium">
          {stage === "confirm" ? "Check what's on the bag" : "The bag"}
        </h2>
        {stage === "confirm" && (
          <p className="text-sm text-ink/60">
            A wrong roaster name sends the search somewhere useless, so it&apos;s worth a glance first.
          </p>
        )}
        {identity &&
          (Object.keys(EMPTY) as (keyof Identity)[])
            // roast_date is rendered below as a date, not as text. It is the
            // one identity field with a date column behind it.
            .filter((key) => key !== "roast_date")
            .map((key) => (
              <Field
                key={key}
                label={key.replace("_", " ")}
                value={identity[key] ?? ""}
                disabled={stage !== "confirm"}
                onChange={(v) => setIdentity({ ...identity, [key]: v })}
              />
            ))}

        {identity && (
          <label className="text-sm text-ink/70 flex flex-col gap-1">
            roast date
            <input
              type="date"
              value={identity.roast_date ?? ""}
              disabled={stage !== "confirm"}
              onChange={(e) => setIdentity({ ...identity, roast_date: e.target.value })}
              className="border border-line rounded-lg px-3 py-2 bg-surface disabled:opacity-60 w-full min-w-0"
            />
            {labelRoastDate && !identity.roast_date && (
              // Said, but not readable as one date. Naming it is the whole
              // point: an empty box here otherwise reads as a bag that did not
              // print a roast date at all. It covers both kinds of unreadable
              // — "05/06/26", which is two dates, and wording that is none.
              <span className="text-xs text-ink-soft">
                The label says <strong>{labelRoastDate}</strong>, which couldn&apos;t be read as one date. Type the
                date you read.
              </span>
            )}
          </label>
        )}
      </section>

      {stage === "confirm" && (
        <div className="flex flex-col gap-2">
          <div className="text-sm text-ink/60 flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2">
              Search with
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as SearchModel)}
                className="border border-line rounded-lg px-2 py-1 bg-surface"
              >
                {(Object.keys(MODEL_LABELS) as SearchModel[]).map((m) => (
                  <option key={m} value={m}>
                    {MODEL_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>

            {/* Absent rather than disabled for a model with no effort control:
                a greyed-out control implies a setting that exists. */}
            {effortsFor(model).length > 0 ? (
              <label className="flex items-center gap-2">
                at effort
                <select
                  value={isEffortFor(model, effort) ? effort : DEFAULT_EFFORT}
                  onChange={(e) => setEffort(e.target.value)}
                  className="border border-line rounded-lg px-2 py-1 bg-surface"
                >
                  {effortsFor(model).map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="text-ink/40">no effort control on this model</span>
            )}
          </div>
          <button
            onClick={() => void findAndSave()}
            className="bg-accent text-accent-ink rounded-xl px-4 py-3 font-medium"
          >
            Save and find brewing instructions
          </button>
        </div>
      )}

      {stage !== "confirm" && guide && <GuideCard guide={guide} />}

      {stage !== "confirm" && warning && (
        // Beside the answer, in the quiet voice: the search did record one,
        // and this is what it recorded it despite.
        <p className="text-xs text-ink-soft bg-surface border border-line rounded-lg px-3 py-2">{warning}</p>
      )}

      {stage !== "confirm" && previousError && (
        <p className="text-xs text-urgent">
          Couldn&apos;t check whether you&apos;ve had this before, so this is not saying you haven&apos;t:{" "}
          {previousError}
        </p>
      )}

      {stage !== "confirm" && previous && (
        <section className="bg-surface border border-accent rounded-2xl p-4 flex flex-col gap-2">
          <h2 className="font-medium">You&apos;ve had this before</h2>
          <p className="text-sm text-ink/70">
            Bought {new Date(previous.created_at).toLocaleDateString()}, last brewed on{" "}
            {[
              previous.brewer ? MY_BREWER_LABELS[previous.brewer as MyBrewer] : null,
              previous.brew_method,
              previous.grinder,
              previous.grind_setting,
            ]
              .filter(Boolean)
              .join(" · ")}
            .
          </p>
          <p className="text-xs text-ink-soft">
            That dial-in belongs to a brew, not to the bag — log a brew on this one when you make it.
          </p>
        </section>
      )}

      {stage !== "confirm" && (
        <section className="bg-surface border border-line rounded-2xl p-4 flex flex-col gap-3">
          <h2 className="font-medium">The purchase</h2>
          {/* Side by side, because they are one question asked twice — when it
              was bought and when it was roasted — and the pair is what tells
              you how old the coffee is. Stacked, they read as two unrelated
              settings and the gap between the dates has to be done in your
              head. Two columns still fit a phone: a date input is a fixed,
              short piece of text. */}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-ink/70 flex flex-col gap-1 min-w-0">
              Purchased
              <input
                type="date"
                value={purchase.purchased_date}
                onChange={(e) => setPurchase({ ...purchase, purchased_date: e.target.value })}
                className="border border-line rounded-lg px-3 py-2 bg-surface w-full min-w-0"
              />
            </label>
            <label className="text-sm text-ink/70 flex flex-col gap-1 min-w-0">
              Roasted
              <input
                type="date"
                value={purchase.roast_date}
                onChange={(e) => setPurchase({ ...purchase, roast_date: e.target.value })}
                className="border border-line rounded-lg px-3 py-2 bg-surface w-full min-w-0"
              />
            </label>
          </div>
          <p className="text-xs text-ink-soft">
            How you brew it is recorded per brew, on the bag in your shelf — a bag holds many brews.
          </p>
        </section>
      )}

      {stage !== "confirm" && (
        <button
          onClick={() => void save()}
          disabled={stage === "saving"}
          className="bg-accent text-accent-ink rounded-xl px-4 py-3 font-medium disabled:opacity-60"
        >
          {stage === "saving" ? "Saving…" : "Save this bag"}
        </button>
      )}
    </div>
  );
}

function GuideCard({ guide }: { guide: Guide }) {
  const rows = [
    ["Method", guide.method ? METHOD_LABELS[guide.method] : null],
    ["Ratio", guide.params.ratio],
    ["Dose", guide.params.dose],
    ["Water", guide.params.water],
    ["Temperature", guide.params.temp],
    ["Grind", guide.params.grind],
    ["Time", guide.params.time],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <section className="bg-surface border border-line rounded-2xl p-4 flex flex-col gap-3">
      <GuideStatusHeader status={guide.status} quotes={guide.quotes} guideUrl={guide.guide_url} />

      {guide.status === "none" ? (
        <p className="text-sm text-ink/70">
          Nothing published for this coffee, and no general brew guide on the roaster&apos;s site. Dial it in
          yourself and note what works.
        </p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink/60">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {guide.dropped.length > 0 && (
        <p className="text-xs text-ink-soft">
          {guide.dropped.length} value{guide.dropped.length === 1 ? "" : "s"} discarded for having no source on the
          page.
        </p>
      )}
    </section>
  );
}

function Library({
  bags,
  query,
  setQuery,
  error,
  onChanged,
}: {
  bags: Bag[];
  query: string;
  setQuery: (q: string) => void;
  error: string | null;
  onChanged: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search roaster, coffee, origin, notes"
        className="w-full border border-line rounded-xl px-3 py-2 bg-surface outline-none focus:border-accent"
      />
      {error ? (
        <p className="text-sm text-urgent bg-surface border border-urgent rounded-lg px-3 py-2">
          The library could not be read, so this is not a statement about what is in it: {error}
        </p>
      ) : bags.length === 0 ? (
        <p className="text-sm text-ink/60 text-center py-10">
          {query ? "Nothing matches that." : "No bags yet. Scan one."}
        </p>
      ) : (
        bags.map((bag) => <BagCard key={bag.id} bag={bag} onChanged={onChanged} />)
      )}
    </div>
  );
}

function BagCard({ bag, onChanged }: { bag: Bag; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brewCount, setBrewCount] = useState<number | null>(null);
  const [draft, setDraft] = useState({
    purchased_date: bag.purchased_date ?? "",
    roast_date: bag.roast_date ?? "",
    my_notes: bag.my_notes ?? "",
  });

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bags/${bag.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't delete that bag.");
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete that bag.");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function save() {
    // The same requirement as the review screen, in the other place a bag is
    // edited. A rule that holds on one screen and not the other is a rule you
    // find out about by accident.
    const missing = missingRequired(draft);
    if (missing) {
      setError(missing);
      return;
    }

    // Only what moved, and nothing at all when nothing did. This card posted
    // every field it rendered, which worked because it always rendered at
    // least one non-empty one — but it means a field another screen wrote
    // while this card sat open would be posted back over.
    const patch = changedFields(
      { purchased_date: bag.purchased_date, roast_date: bag.roast_date, my_notes: bag.my_notes },
      draft
    );
    if (!hasChanges(patch)) {
      setOpen(false);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/bags/${bag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      // A save that failed used to close the card as though it had worked. The
      // next render read the row back and quietly showed the old values.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't save that bag.");
      }

      setOpen(false);
      onChanged();
    } catch (e) {
      // A dropped connection throws rather than answering, and without this
      // the button sat on "Saving…" forever with nothing said.
      setError(e instanceof Error ? e.message : "Couldn't save that bag.");
    } finally {
      setSaving(false);
    }
  }

  const guideRows = [
    ["Method", bag.guide_method ? METHOD_LABELS[bag.guide_method as BrewMethod] : null],
    ["Ratio", bag.guide_ratio],
    ["Dose", bag.guide_dose],
    ["Water", bag.guide_water],
    ["Temp", bag.guide_temp],
    ["Grind", bag.guide_grind],
    ["Time", bag.guide_time],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <article className="bg-surface border border-line rounded-2xl overflow-hidden">
      {/* The toggle and the link are siblings, never nested. An <a> inside a
          <button> is invalid markup and browsers disagree about what a tap on
          it should do — as siblings the link cannot bubble to the toggle, so
          neither needs to know about the other. */}
      <div className="flex items-stretch">
        <button
          onClick={() => setOpen(!open)}
          className="min-w-0 flex-1 flex gap-3 p-3 text-left items-center"
        >
          {bag.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bag.photo_url} alt="" className="w-14 h-14 rounded-lg object-cover bg-paper shrink-0" />
          ) : (
            <span className="w-14 h-14 rounded-lg bg-paper grid place-items-center shrink-0" aria-hidden>☕</span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block font-medium truncate">{bag.coffee_name}</span>
            <span className="block text-sm text-ink/60 truncate">
              {bag.roaster}
              {bag.origin ? ` · ${bag.origin}` : ""}
            </span>
          </span>
        </button>

        {/* Full height and generously padded: this sits against the toggle on
            a phone, and a narrow target here opens the wrong thing. */}
        {bag.product_url && (
          <a
            href={bag.product_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${bag.coffee_name ?? "this coffee"} on the roaster's site`}
            className="shrink-0 flex items-center px-4 text-sm text-accent underline"
          >
            Beans ↗
          </a>
        )}
      </div>

      {open && (
        <div className="border-t border-line p-4 flex flex-col gap-5">

          {/* Your side of the bag first. The roaster's recipe is fixed the
              moment you buy it; the purchase date and what the coffee tastes
              like are the parts you come back and change, so they sit above
              the block that never moves. */}
          <section className="flex flex-col gap-3">
            <SectionHead>This bag</SectionHead>
            {/* The two dates share a row. They are one question asked twice —
                bought when, roasted when — and the distance between them is
                the age of the coffee, which is the thing you are actually
                reading. Stacked, that subtraction happens in your head.
                Roasted is editable here because it is the bag's and not the
                roaster's: a model told to report only what is legible will
                leave a smudged or oddly printed date alone, so it has to be
                typeable afterwards. */}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-ink/70 flex flex-col gap-1 min-w-0">
                Purchased
                <input
                  type="date"
                  value={draft.purchased_date}
                  onChange={(e) => setDraft({ ...draft, purchased_date: e.target.value })}
                  className="border border-line rounded-lg px-3 py-2 bg-surface w-full min-w-0"
                />
              </label>
              <label className="text-sm text-ink/70 flex flex-col gap-1 min-w-0">
                Roasted
                <input
                  type="date"
                  value={draft.roast_date}
                  onChange={(e) => setDraft({ ...draft, roast_date: e.target.value })}
                  className="border border-line rounded-lg px-3 py-2 bg-surface w-full min-w-0"
                />
              </label>
            </div>
            <label className="text-sm text-ink/70 flex flex-col gap-1">
              Brew Notes
              <textarea
                rows={3}
                value={draft.my_notes}
                onChange={(e) => setDraft({ ...draft, my_notes: e.target.value })}
                className="border border-line rounded-lg px-3 py-2 bg-surface"
              />
              {/* The helper stays, and carries more weight than it used to:
                  this field and the per-brew notes field now have names that
                  sound alike, and only this sentence says which is which. */}
              <span className="text-xs text-ink-soft">
                What the coffee tastes like, which outlives any one brew. Per-brew observations go on the brew.
              </span>
            </label>
          </section>

          <section className="flex flex-col gap-3 border-t border-line pt-4">
            <div className="flex items-start justify-between gap-3">
              <SectionHead>Recipe</SectionHead>
              <Research bag={bag} onChanged={onChanged} />
            </div>

            <GuideStatusHeader
              status={bag.guide_status}
              quotes={bag.guide_quotes ?? []}
              guideUrl={bag.guide_url !== bag.product_url ? bag.guide_url : null}
            />

            <div>
              {/* The parsed values get a name of their own. Without it the rows
                  read as though the status header were describing them, and
                  the difference between what was quoted and what was parsed
                  out of the quote is the difference this app exists to show. */}
              <h4 className="text-sm font-semibold mb-1">Instructions</h4>
              {guideRows.length ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  {guideRows.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-ink/60">{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-ink/60">Nothing recorded from the roaster.</p>
              )}
            </div>

            {/* Only where the roaster published nothing. A tier-2 house guide
                is a recipe that was found, and suggesting over it would bury
                the thing this app exists to retrieve. */}
            {bag.guide_status === "none" && <SuggestedRecipe bag={bag} onChanged={onChanged} />}
          </section>

          {error && (
            <p className="text-sm text-urgent bg-surface border border-urgent rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Save and Delete share a row, pushed to opposite ends. Deleting a
              bag takes its photo and every brew with it and cannot be undone,
              so the confirm *replaces* this row rather than opening beside it
              — on a phone there is then nothing adjacent to hit by accident,
              which is why the two buttons being inline is safe at all. */}
          {confirmingDelete ? (
            <div className="flex flex-col gap-2 border border-urgent rounded-lg p-3">
              <p className="text-sm text-ink/70">
                Delete <strong>{bag.coffee_name}</strong>, its photo
                {brewCount ? ` and ${brewCount} brew${brewCount === 1 ? "" : "s"}` : ""}? This cannot be
                undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => void remove()}
                  disabled={deleting}
                  className="flex-1 bg-urgent text-ink-invert rounded-lg px-3 py-2 font-medium disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  className="flex-1 border border-line rounded-lg px-3 py-2"
                >
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => void save()}
                disabled={saving || deleting}
                className="bg-accent text-accent-ink rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                className="border border-urgent text-urgent rounded-lg px-4 py-2 text-sm font-medium"
              >
                Delete
              </button>
            </div>
          )}

          <Brews
            bagId={bag.id}
            onCount={setBrewCount}
            guide={{ dose: bag.guide_dose, water: bag.guide_water, ratio: bag.guide_ratio, method: bag.guide_method }}
          />
        </div>
      )}
    </article>
  );
}

/**
 * The brews of one bag, and the form for adding another.
 *
 * The form works in dose, ratio and water, because that is the shape of the
 * decision you actually make: you pick a dose and a strength, and the water
 * follows. Any two of the three give the third, and only dose and water are
 * sent — the ratio is water over dose and has no column, for the same reason
 * extraction yield is generated in Postgres rather than accepted from here.
 *
 * The refractometer half of the form — beverage mass, TDS and the extraction
 * read-out — is commented out below rather than deleted. It is a real
 * measurement path with a column, a generated column and tests behind it, and
 * none of that changed; what changed is that it is not what this form is for
 * today. Uncommenting it is the whole of putting it back.
 */
function Brews({
  bagId,
  onCount,
  guide,
}: {
  bagId: string;
  onCount: (n: number) => void;
  guide: GuideNumbers;
}) {
  const [brews, setBrews] = useState<Brew[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<BrewDraft>(blankBrew());
  const [source, setSource] = useState<BrewSource>("blank");
  const [rating, setRating] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bags/${bagId}/brews`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't read the brews.");
      setBrews(data.brews);
      onCount(data.brews.length);
      setError(null);
    } catch (e) {
      // An unread list and an empty one must not look the same.
      setError(e instanceof Error ? e.message : "Couldn't read the brews.");
      setBrews([]);
    }
  }, [bagId, onCount]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    // Checked before anything is sent, because the only wrong answer here is
    // a confident one: "3" in a time box is three minutes to one person and
    // three seconds to another, and a brew logged at the wrong one of those
    // is indistinguishable afterwards from a brew that really ran that long.
    const seconds = parseBrewTime(draft.time);
    if (draft.time.trim() && seconds == null) {
      setError("Brew time reads as minutes and seconds — 3:00.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // The ratio is left behind deliberately: it is water over dose, the
      // server has no column for it, and sending a derived number is how a
      // second copy of one fact gets born. The time goes as the seconds it
      // parsed to, because m:ss is a way of writing a duration rather than a
      // second fact about it.
      const { ratio: _ratio, time: _time, ...row } = draft;
      const res = await fetch(`/api/bags/${bagId}/brews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...row,
          grind_setting: formatGrindSetting(draft.grind_setting),
          brew_seconds: seconds,
          rating,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't log that brew.");
      setAdding(false);
      clear();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't log that brew.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Opening the form repeats the last brew on this bag, and falls back to the
   * roaster's own numbers where there is no last brew to repeat. Dialling in
   * is one change at a time, so the settings you did not mean to touch should
   * already be there — see `openingBrew` for which fields carry, which
   * defer, and why no reading carries at all.
   */
  function startAdding() {
    const previous = brews?.[0] ?? null;
    const opened = openingBrew(previous, guide);
    setDraft(opened.draft);
    setSource(opened.source);
    setRating(null);
    setAdding(true);
  }

  function clear() {
    setDraft(blankBrew());
    setSource("blank");
    setRating(null);
  }

  /**
   * Remove one logged brew, once the row has asked. A failure is said rather
   * than swallowed: the list was reloaded either way, so a delete that did
   * not happen used to look exactly like one that did not need to.
   */
  async function removeBrew(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/brews/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't remove that brew.");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove that brew.");
    }
  }

  return (
    <section className="flex flex-col gap-3 border-t border-line pt-4">
      <SectionHead>Brews{brews?.length ? ` (${brews.length})` : ""}</SectionHead>

      {error && (
        <p className="text-sm text-urgent bg-surface border border-urgent rounded-lg px-3 py-2">{error}</p>
      )}

      {brews?.length === 0 && !error && <p className="text-sm text-ink/60">No brews logged yet.</p>}

      {brews?.map((b) => (
        <BrewRow key={b.id} brew={b} onDelete={() => void removeBrew(b.id)} />
      ))}

      {adding ? (
        <div className="flex flex-col gap-3 bg-paper border border-line rounded-xl p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs text-ink-soft">
              {source === "repeat"
                ? "Settings repeated from your last brew."
                : source === "guide"
                  ? "Starting from the roaster's own numbers. Nothing is saved until you log it."
                  : "A fresh brew."}
            </p>
            <button onClick={clear} className="text-xs text-accent underline shrink-0">
              Clear
            </button>
          </div>

          <label className="text-sm text-ink/70 flex flex-col gap-1">
            Rating
            <Stars value={rating} onChange={setRating} />
          </label>

          <Inline>
            <label className="text-sm text-ink/70 flex flex-col gap-1">
              Brewer
              <select
                value={draft.brewer}
                onChange={(e) => setDraft({ ...draft, brewer: e.target.value })}
                className="border border-line rounded-lg px-3 py-2 bg-surface"
              >
                <option value="">—</option>
                {MY_BREWERS.map((b) => (
                  <option key={b} value={b}>
                    {MY_BREWER_LABELS[b]}
                  </option>
                ))}
              </select>
            </label>
            <Field label="brew method" value={draft.brew_method} onChange={(v) => setDraft({ ...draft, brew_method: v })} />
          </Inline>

          <Inline>
            <label className="text-sm text-ink/70 flex flex-col gap-1">
              Grinder
              <select
                value={draft.grinder}
                onChange={(e) => setDraft({ ...draft, grinder: e.target.value })}
                className="border border-line rounded-lg px-3 py-2 bg-surface"
              >
                <option value="">—</option>
                {GRINDERS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <Field label="grind setting" value={draft.grind_setting} onChange={(v) => setDraft({ ...draft, grind_setting: v })} />
          </Inline>

          {/* Three fields, one decision. Changing the dose holds the ratio
              and moves the water, because scaling a recipe is the reason to
              brew to a ratio at all; typing a water mass states the ratio
              instead, so that direction re-derives it. The arithmetic is in
              lib/brews.ts so it can be tested without a browser. */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="dose (g)" value={draft.dose_g} onChange={(v) => setDraft(withDose(draft, v))} />
            <Field label="ratio" value={draft.ratio} onChange={(v) => setDraft(withRatio(draft, v))} />
            <Field label="water (g)" value={draft.water_g} onChange={(v) => setDraft(withWater(draft, v))} />
          </div>

          {/* Time sits under the three it belongs with, in a track the same
              width, rather than crowding them into four columns on a phone.
              It is deliberately not prefilled from anywhere — not from the
              last brew and not from the roaster's published time — because
              this box holds what the timer said, and a number already in it
              is a stopwatch nobody started. */}
          <div className="grid grid-cols-3 gap-3">
            <Field
              label="time (m:ss)"
              value={draft.time}
              onChange={(v) => setDraft({ ...draft, time: v })}
              placeholder="3:00"
            />
          </div>

          {/* The refractometer half, commented out rather than removed. The
              columns, the generated extraction_yield and their tests are all
              still there; this is the form choosing not to ask today.

          <Inline>
            <Field label="in the cup (g)" value={draft.beverage_g} onChange={(v) => setDraft({ ...draft, beverage_g: v })} />
          </Inline>

          <TdsInput percent={tdsPercent} onPercent={setTdsPercent} />

          {live != null && (
            <p className="text-sm">
              <strong>{live}%</strong> extraction —{" "}
              <span className={band(live, YIELD_TARGET) === "in" ? "text-ink/70" : "text-urgent"}>
                {readBrew({ tdsPercent: pct, yieldPercent: live })}
              </span>
            </p>
          )}

          <BrewNotes />

          */}

          <label className="text-sm text-ink/70 flex flex-col gap-1">
            Notes on this brew
            <textarea
              rows={2}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              className="border border-line rounded-lg px-3 py-2 bg-surface"
            />
          </label>

          <div className="flex gap-2">
            <button
              onClick={() => void add()}
              disabled={saving}
              className="flex-1 bg-accent text-accent-ink rounded-lg px-3 py-2 font-medium disabled:opacity-60"
            >
              {saving ? "Saving…" : "Log this brew"}
            </button>
            <button onClick={() => setAdding(false)} className="flex-1 border border-line rounded-lg px-3 py-2">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={startAdding} className="self-start text-sm text-accent underline">
          Log a brew
        </button>
      )}
    </section>
  );
}

/**
 * One logged brew.
 *
 * A pill on a shelf is read at a glance, so it carries what separates one
 * attempt from the next and nothing else.
 *
 * **The rating leads**, because scanning a dial-in is looking for the good
 * one. **Nothing about the grinder shows** — it is one machine on one
 * counter and repeats on every row, so neither its name nor the dial
 * setting says anything while taking a line. Joel called this one on
 * 2026-09-21, closing the judgement call the setting had been left as.
 * **"water" is gone from the numbers**, because `18g · 305g · 1:17` is
 * already unambiguous — the second mass in a brewing recipe is the water.
 * **The time sits beside them** behind a rule rather than under them, since
 * time and ratio are the two you actually compare between attempts.
 */
function BrewRow({ brew, onDelete }: { brew: Brew; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const pct = brew.tds_percent == null ? null : Number(brew.tds_percent);
  const ey = brew.extraction_yield == null ? null : Number(brew.extraction_yield);
  const dose = brew.dose_g == null ? null : Number(brew.dose_g);
  const water = brew.water_g == null ? null : Number(brew.water_g);
  // Derived here for the same reason it is derived in the form: water over
  // dose is one fact, and a stored copy is a second one that can disagree.
  const ratio = ratioFor(dose, water);
  const time = formatBrewTime(brew.brew_seconds);
  const recipe = [dose ? `${dose}g` : null, water ? `${water}g` : null, ratio ? `1:${ratio}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="bg-paper border border-line rounded-xl p-3 flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium min-w-0 flex items-baseline gap-2">
          {brew.rating ? (
            <span className="text-accent shrink-0" aria-label={`${brew.rating} of 5`}>
              {"★".repeat(brew.rating)}
            </span>
          ) : null}
          <span className="min-w-0 truncate">
            {brew.brewer ? MY_BREWER_LABELS[brew.brewer as MyBrewer] : "Brew"}
            {brew.brew_method ? ` · ${brew.brew_method}` : ""}
          </span>
        </span>
        <span className="text-xs text-ink-soft shrink-0">{new Date(brew.brewed_at).toLocaleDateString()}</span>
      </div>

      {(recipe || time) && (
        <div className="flex items-center gap-2 text-sm">
          {recipe && <span>{recipe}</span>}
          {/* A real rule rather than a typed bar: it takes the row's height
              and the line colour, so it separates the two readings without
              reading as a third one. */}
          {recipe && time && <span aria-hidden className="w-px self-stretch bg-line shrink-0" />}
          {time && <span>{time}</span>}
        </div>
      )}

      {pct != null && (
        <span className="text-sm">
          TDS <strong>{pct}%</strong> <span className="text-ink-soft">({percentToPpm(pct)} ppm)</span>
          {ey != null && (
            <>
              {" · "}
              <strong className={band(ey, YIELD_TARGET) === "in" ? "" : "text-urgent"}>{ey}%</strong> extraction
            </>
          )}
        </span>
      )}

      {brew.notes && <span className="text-sm text-ink/70">{brew.notes}</span>}

      {/* Two taps, the second replacing the first, for the reason the bag's
          own delete asks: a brew is one step of a dial-in, and losing it to a
          stray tap on a phone cannot be undone. */}
      {confirming ? (
        <span className="flex items-center gap-3 mt-1 text-xs">
          <span className="text-ink/70">Remove this brew?</span>
          <button
            onClick={() => {
              setConfirming(false);
              onDelete();
            }}
            className="text-urgent underline font-medium"
          >
            Yes, remove
          </button>
          <button onClick={() => setConfirming(false)} className="text-ink-soft underline">
            Keep it
          </button>
        </span>
      ) : (
        <button onClick={() => setConfirming(true)} className="self-start text-xs text-urgent underline mt-1">
          Remove
        </button>
      )}
    </div>
  );
}

// Commented out with the TDS half of the brew form, not deleted. Both of
// these describe a measurement path that still exists in full — the
// tds_percent column, the generated extraction_yield, percentToPpm and its
// tests are all untouched — so uncommenting them and the block in the form
// above is the whole of putting it back.
// /** One reading, two units. Type either; percent is what gets stored. */
// function TdsInput({ percent, onPercent }: { percent: string; onPercent: (v: string) => void }) {
//   const asNumber = percent ? Number(percent) : null;
//   return (
//     <Inline>
//       <Field label="TDS (%)" value={percent} onChange={onPercent} />
//       <label className="text-sm text-ink/70 flex flex-col gap-1">
//         TDS (ppm)
//         <input
//           inputMode="numeric"
//           value={asNumber ? String(percentToPpm(asNumber)) : ""}
//           onChange={(e) => {
//             const ppm = Number(e.target.value);
//             onPercent(e.target.value && Number.isFinite(ppm) ? String(ppmToPercent(ppm)) : "");
//           }}
//           className="border border-line rounded-lg px-3 py-2 bg-surface"
//         />
//       </label>
//     </Inline>
//   );
// }
//
// /** The margin notes: how to take the reading, and what it means. */
// function BrewNotes() {
//   return (
//     <details className="text-xs text-ink/60 bg-surface border border-line rounded-lg px-3 py-2">
//       <summary className="cursor-pointer">How to measure this</summary>
//       <ul className="list-disc pl-4 mt-2 flex flex-col gap-1">
//         <li>
//           <strong>Extraction = (cup grams × TDS%) ÷ dose grams.</strong> Weigh the cup, not the kettle — the bed
//           keeps roughly 2g of water per gram of coffee, and using water-in overstates extraction by about a tenth.
//         </li>
//         <li>
//           <strong>TDS is strength; extraction is how much you pulled out.</strong> A drink can be strong and
//           under-extracted at once. Ratio moves strength, grind moves extraction.
//         </li>
//         <li>
//           Filter targets: TDS {TDS_TARGET.low}–{TDS_TARGET.high}%, extraction {YIELD_TARGET.low}–{YIELD_TARGET.high}%.
//           Under is sour and thin, over is bitter and drying.
//         </li>
//         <li>
//           <strong>1% = 10,000 ppm.</strong> A refractometer reads percent. Cheap conductivity pens read ppm and are
//           not measuring coffee TDS — they measure dissolved ions against a water calibration, and most of what is in
//           coffee is not ionic.
//         </li>
//         <li>Let the sample cool and filter it before reading, or it reads high.</li>
//       </ul>
//     </details>
//   );
// }

/** One section's name, in the same voice everywhere the card uses one. */
/**
 * Claude's own recipe, for a bag whose roaster published none.
 *
 * Everything about how this renders is about keeping it distinguishable from
 * the block above it. The tier light stays **No Recipe Found**, because that
 * is still the true answer to what the roaster said. This card carries no tier
 * colour, sits inside a dashed border rather than the solid one the roaster's
 * values get, says Claude in its heading, and names the model and the day it
 * was generated underneath.
 *
 * None of that is decoration. `RULES.md` §1 refuses an invented recipe in the
 * `guide_*` columns and still does — this is a different column, and the only
 * way it could damage the rule is by coming to look like the other block.
 * The wording lives in `lib/guideDisplay.ts` with a test that holds it to it.
 */
/**
 * Run the search again on a bag that has already been searched.
 *
 * Joel, 2026-09-20: *"Add refresh button to research for recipe. This should
 * also refresh link."* It does, and not as a second feature bolted beside the
 * first: the search writes `product_url` and `guide_url` through the same
 * `guideColumns` the original run used, so the **Beans ↗** link on the pill is
 * re-derived from whatever this run found rather than patched separately. A
 * roaster who has since published a guide, or moved the page out from under
 * the old link, is the case this exists for.
 *
 * **It is a trigger, not a second kind of search.** Joel, 2026-09-22:
 * *"Research should just kick off the original search not be a unique
 * process."* So it posts the bag and nothing else: the route sources the
 * product page from the row and falls back to its own default model and
 * effort, which is the dial this button never offered anyway — the scan
 * screen's picker is a comparison harness you set up deliberately on the way
 * in, and this is a button pressed one-handed in a kitchen. What ran is
 * recorded on the row either way, and the search itself cannot tell which of
 * the two started it.
 *
 * **It polls rather than waits**, for the reason the scan screen does: the
 * search runs for minutes with nothing on the connection, and the answer
 * lands on the row. Closing the card — or the tab — cannot lose it.
 */
function Research({ bag, onChanged }: { bag: Bag; onChanged: () => void }) {
  // **Starts from the row.** A card opened while a search is already running
  // on this bag — started from the scan screen, from another tab, or by this
  // button before the card was closed — shows it running and offers no second
  // one. It used to start idle, so two searches could race for one row. The
  // route refuses a second one too; this is the same rule, visible.
  const alreadyRunning = searchIsRunning(bag.guide_search_started_at);
  const [searching, setSearching] = useState(alreadyRunning);
  const [error, setError] = useState<string | null>(null);
  // Said beside the answer this search recorded, not in place of one.
  const [warning, setWarning] = useState<string | null>(null);
  // Held in refs so a re-render of the library — which hands this component a
  // new onChanged every time — restarts the interval without forgetting that
  // the search was already seen running.
  const seenRunning = useRef(alreadyRunning);
  // The answer the row held when this search started, so "a new answer
  // landed" can be told from "the old one is still there".
  const answeredBefore = useRef(bag.guide_fetched_at);
  const changed = useRef(onChanged);
  changed.current = onChanged;

  function start() {
    if (!bag.roaster || !bag.coffee_name) {
      setError("A roaster and a coffee name are needed to search.");
      return;
    }
    setError(null);
    setWarning(null);
    seenRunning.current = false;
    answeredBefore.current = bag.guide_fetched_at;
    setSearching(true);

    // Fired, not awaited — the same call the scan screen makes, for the same
    // reason. Its answer is read back off the row below.
    void fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The bag and nothing else. No product URL — the route reads that off
      // the row — and no model or effort, so the defaults this button always
      // used are the route's own rather than a second copy of them here.
      // Joel, 2026-09-22: "Research is a trigger."
      body: JSON.stringify({ bag_id: bag.id, roaster: bag.roaster, coffee_name: bag.coffee_name }),
    }).catch(() => {});
  }

  useEffect(() => {
    if (!searching) return;
    const launched = Date.now();

    const tick = async () => {
      // No photo: this runs every four seconds and never shows one.
      const res = await fetch(`/api/bags/${bag.id}?photo=0`);
      if (!res.ok) return;
      const fresh = (await res.json()).bag as Bag;

      if (fresh.guide_search_started_at) {
        seenRunning.current = true;
        // A stamp nothing can still be working under: the function was
        // stopped without reaching the line that records why.
        if (searchIsStale(fresh.guide_search_started_at)) {
          setSearching(false);
          setError(STALE_SEARCH_MESSAGE);
        }
        return;
      }

      // Nothing in flight. That is either "it finished" or "it never got
      // going", and the difference is whether this ever saw it running —
      // which is the same distinction the row exists to make. Give the
      // route a grace period to stamp the row before believing the second.
      if (!seenRunning.current && Date.now() - launched < SEARCH_START_GRACE_MS) return;

      setSearching(false);
      // A search that recorded an answer may have recorded a warning beside
      // it; one that failed recorded why instead. Reporting nothing here
      // would be the empty-and-unread confusion this app keeps paying for.
      const answered = !!fresh.guide_fetched_at && fresh.guide_fetched_at !== answeredBefore.current;
      if (answered) {
        setWarning(fresh.guide_search_error);
        setError(null);
      } else {
        setError(
          fresh.guide_search_error ??
            (seenRunning.current ? null : "The search did not start. Nothing on this bag changed.")
        );
      }
      changed.current();
    };

    const timer = setInterval(() => void tick(), 4000);
    return () => clearInterval(timer);
  }, [searching, bag.id]);

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <button
        onClick={start}
        disabled={searching}
        className="text-sm text-accent underline disabled:opacity-60 disabled:no-underline"
      >
        {searching ? "Searching…" : "Search again"}
      </button>
      {searching && (
        <span className="text-xs text-ink-soft text-right">
          Minutes, not seconds. You can close this.
        </span>
      )}
      {error && <span className="text-xs text-urgent text-right">{error}</span>}
      {warning && !error && <span className="text-xs text-ink-soft text-right">{warning}</span>}
    </div>
  );
}

function SuggestedRecipe({ bag, onChanged }: { bag: Bag; onChanged: () => void }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggestion = bag.suggested_recipe;

  async function ask() {
    setAsking(true);
    setError(null);
    try {
      const res = await fetch(`/api/bags/${bag.id}/suggest`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't get a suggestion.");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get a suggestion.");
    } finally {
      setAsking(false);
    }
  }

  const rows = suggestion
    ? ([
        ["Method", suggestion.method ? METHOD_LABELS[suggestion.method] : null],
        ["Ratio", suggestion.params.ratio],
        ["Dose", suggestion.params.dose],
        ["Water", suggestion.params.water],
        ["Temp", suggestion.params.temp],
        ["Grind", suggestion.params.grind],
        ["Time", suggestion.params.time],
      ].filter(([, v]) => v) as [string, string][])
    : [];

  return (
    <div className="border border-dashed border-line rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span aria-hidden className={`w-2.5 h-2.5 rounded-full ${SUGGESTION_PRESENTATION.dot}`} />
        <h4 className="text-sm font-semibold">{SUGGESTION_PRESENTATION.label}</h4>
      </div>

      {suggestion ? (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink/60">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {suggestion.rationale && <p className="text-sm text-ink/70">{suggestion.rationale}</p>}
          <p className="text-xs text-ink-soft">
            {SUGGESTION_PRESENTATION.note}{" "}
            {MODEL_LABELS[suggestion.model as SearchModel] ?? suggestion.model}, {" "}
            {new Date(suggestion.generated_at).toLocaleDateString()}.
          </p>
        </>
      ) : (
        <p className="text-xs text-ink-soft">{SUGGESTION_PRESENTATION.note}</p>
      )}

      {/* The stored failure and this session's failure are different things
          and both are worth seeing: one says the automatic attempt after the
          search failed, the other that the button just did. */}
      {bag.suggested_error && !suggestion && (
        <p className="text-xs text-urgent">Last attempt failed: {bag.suggested_error}</p>
      )}
      {error && <p className="text-xs text-urgent">{error}</p>}

      <button
        onClick={() => void ask()}
        disabled={asking}
        className="self-start border border-line rounded-lg px-3 py-1.5 text-sm disabled:opacity-60"
      >
        {asking ? "Asking Claude…" : suggestion ? "Ask again" : "Ask Claude for a starting point"}
      </button>
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{children}</h3>
  );
}

/**
 * Which of the three answers the search came back with, and the evidence one
 * tap underneath it.
 *
 * **The indicator is never the only signal.** Colour carries the same thing the
 * label says in words, so the row still reads correctly to anyone who cannot
 * separate the three hues — and the words are the ones that get quoted back,
 * not the colour.
 *
 * It is a real `<details>` rather than a div with a click handler: the summary
 * is focusable, operable from the keyboard and announced as a disclosure
 * without any of that being written here.
 *
 * The quote lives inside because it is the check on everything below it, and
 * putting the check behind one tap is the compromise between showing the
 * evidence and not making a shelf of bags unreadable.
 *
 * **It is a quiet line rather than a panel**, on Joel's instruction of
 * 2026-09-20: *"Remove the section around found brew guide on page. And make
 * font smaller and grey italic with the dropdown carrot."* A bordered box
 * gave the provenance the same weight as the instructions underneath it,
 * which is backwards — the recipe is what you came to read and this says
 * where it came from. **Nothing about the two-signal rule changed**: the dot
 * still carries the tier and the words still say it, so grey is the type
 * colour and never the answer.
 */
function GuideStatusHeader({
  status,
  quotes,
  guideUrl,
}: {
  status: GuideStatus;
  quotes: { text: string }[];
  guideUrl: string | null;
}) {
  const { label, dot } = guidePresentation(status);
  const hasQuotes = quotes?.length > 0;

  return (
    <details className="group">
      <summary className="flex items-center gap-2 py-1.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} aria-hidden />
        <span className="text-xs italic text-ink-soft min-w-0 truncate">{label}</span>
        <span className="text-ink-soft text-xs shrink-0 transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
      </summary>
      <div className="pt-1 pb-2 flex flex-col gap-3">
        {hasQuotes ? (
          <Quotes quotes={quotes} />
        ) : (
          <p className="text-sm text-ink/60">
            {status === "not_searched"
              ? "The search has not run for this bag yet."
              : "Nothing was quoted from the roaster's site."}
          </p>
        )}
        {guideUrl && (
          <a
            href={guideUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-accent underline break-all"
          >
            The brew guide ↗
          </a>
        )}
      </div>
    </details>
  );
}

/**
 * What the page actually said, above the parsed values rather than folded
 * away beneath them.
 *
 * The parsed row is a reading of the quote, so the quote is the thing with
 * authority — and a misparse is only visible if you meet the source before
 * the summary of it. It was a collapsed `<details>` under the table, which
 * put the evidence one tap away from the claim it backs.
 */
function Quotes({ quotes }: { quotes: { text: string }[] }) {
  if (!quotes?.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-soft">What the page actually said</p>
      <ul className="flex flex-col gap-2">
        {quotes.map((q, i) => (
          <li key={i} className="border-l-2 border-line pl-3 text-sm text-ink/70 italic">
            &ldquo;{q.text}&rdquo;
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="text-sm text-ink/70 flex flex-col gap-1 capitalize">
      {label}
      <input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="border border-line rounded-lg px-3 py-2 bg-surface disabled:bg-paper disabled:text-ink/70 normal-case w-full min-w-0"
      />
    </label>
  );
}

/**
 * Rating as a meter rather than a dropdown: tap the star you mean. Tapping
 * the current rating again clears it, because "I have not rated this" and
 * "I rated it one star" are different things and a picker with no way back
 * to the first makes one of them unreachable.
 */
function Stars({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          aria-pressed={value === n}
          onClick={() => onChange(value === n ? null : n)}
          className={`text-2xl leading-none px-0.5 ${value && n <= value ? "text-accent" : "text-line"}`}
        >
          ★
        </button>
      ))}
      {value ? (
        <button type="button" onClick={() => onChange(null)} className="text-xs text-ink-soft underline ml-2">
          clear
        </button>
      ) : (
        <span className="text-xs text-ink/40 ml-2">not rated</span>
      )}
    </div>
  );
}

/** Two fields on one row on a phone, which is where this is used. */
function Inline({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function Busy({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="text-center py-16">
      <p className="font-medium">{label}</p>
      {hint && <p className="text-sm text-ink/60 mt-1">{hint}</p>}
    </div>
  );
}

/**
 * A stored bag back into the guide shape the card renders. The search no
 * longer hands its result to the page directly, so this is how it arrives.
 */
function guideFromBag(bag: Bag): Guide {
  const params = { ratio: bag.guide_ratio, dose: bag.guide_dose, water: bag.guide_water, temp: bag.guide_temp, grind: bag.guide_grind, time: bag.guide_time };
  return {
    status: bag.guide_status,
    product_url: bag.product_url,
    guide_url: bag.guide_url,
    method: bag.guide_method as Guide["method"],
    params: Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Guide["params"],
    quotes: bag.guide_quotes as Guide["quotes"],
    dropped: (bag.guide_dropped ?? []) as Guide["dropped"],
  };
}

function stripNulls(identity: Identity): Partial<Identity> {
  return Object.fromEntries(Object.entries(identity ?? {}).filter(([, v]) => v != null)) as Partial<Identity>;
}
