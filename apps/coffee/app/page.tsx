"use client";

import { useCallback, useEffect, useState } from "react";
import { downscale } from "@/lib/image";
import { LIVERY } from "@/lib/livery";
import ThemeControl from "./ThemeControl";
import { METHOD_LABELS, type BrewMethod } from "@/lib/methods";
import {
  extractionYield,
  percentToPpm,
  ppmToPercent,
  readBrew,
  band,
  blankBrew,
  repeatOf,
  TDS_TARGET,
  YIELD_TARGET,
  type BrewDraft,
} from "@/lib/brews";
import {
  MY_BREWERS,
  MY_BREWER_LABELS,
  GRINDERS,
  myBrewerFor,
  type MyBrewer,
} from "@/lib/brewers";
import type { Guide, GuideStatus } from "@/lib/guide";
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
  beverage_g: string | number | null;
  tds_percent: string | number | null;
  extraction_yield: string | number | null;
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

const GUIDE_LABELS: Record<GuideStatus, string> = {
  coffee_specific: "The roaster's recipe, from this coffee's own page",
  roaster_generic: "The roaster's house method, from elsewhere on their site",
  none: "No published instructions",
  not_searched: "Not searched",
};

/**
 * The tier is decided by **where** the instructions were read, because that is
 * the only part a search can verify. It is not a claim that the roaster wrote
 * them for this lot, and the first real bag is exactly the case that shows the
 * difference: Sweet Bloom print one house recipe — Origami Air, 1:17, 900µm,
 * 2:40 — on every product page, so it validated as `coffee_specific` while
 * being the same recipe they give for everything.
 *
 * The label used to read "The roaster's recipe for this coffee", which asserted
 * the part that was never checked. It now says where it came from, and this
 * says out loud what that does and does not prove. Surfacing the uncertainty
 * beats resolving it in code: nothing in one page can tell the two apart.
 */
const PRODUCT_PAGE_CAVEAT =
  "Published on this coffee's page, which is not the same as written for it — plenty of roasters print one default recipe on all of them. The quote below is the check.";

export default function CoffeePage() {
  // Scanning is an action you take occasionally; the library is the thing you
  // come back to. Two tabs gave them equal weight and hid one behind the
  // other — so the library is now the page, and scanning opens above it.
  const [scanning, setScanning] = useState(false);
  const [bags, setBags] = useState<Bag[]>([]);
  const [query, setQuery] = useState("");
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const loadBags = useCallback(async (q: string) => {
    // A failed load used to do nothing at all, which rendered as "No bags
    // yet. Scan one." — a confident statement about data that was never
    // read. An empty library and a broken one must not look the same.
    try {
      const res = await fetch(`/api/bags${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't load the library.");
      setBags(data.bags ?? []);
      setLibraryError(null);
    } catch (e) {
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
        <div className="ml-auto">
          <ThemeControl livery={LIVERY} onBar />
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
  const [purchased, setPurchased] = useState("");
  const [stage, setStage] = useState<"idle" | "reading" | "confirm" | "searching" | "review" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [previous, setPrevious] = useState<PreviousBag | null>(null);
  const [carried, setCarried] = useState(false);
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
      setIdentity({ ...EMPTY, ...stripNulls(data.identity as Identity) });
      setStage("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setIdentity({ ...EMPTY });
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
    setWaited(0);
    setStage("searching");
    void lookForPrevious(identity.roaster, identity.coffee_name);

    try {
      const body = new FormData();
      for (const [k, v] of Object.entries(identity)) if (v) body.append(k, v);
      if (photo) body.append("photo", photo);
      const res = await fetch("/api/bags", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save that bag.");

      const id = data.bag.id as string;
      setBagId(id);

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

  async function lookForPrevious(roaster: string, coffeeName: string) {
    const res = await fetch(
      `/api/bags?roaster=${encodeURIComponent(roaster)}&coffee_name=${encodeURIComponent(coffeeName)}`
    );
    if (!res.ok) return;
    setPrevious(((await res.json()).previous as PreviousBag) ?? null);
  }

  // Poll the saved row. The search writes its answer there, so this survives
  // the request that started it being dropped, backgrounded or timed out.
  useEffect(() => {
    if (stage !== "searching" || !bagId) return;
    const started = Date.now();

    const tick = async () => {
      setWaited(Math.round((Date.now() - started) / 1000));
      const res = await fetch(`/api/bags/${bagId}`);
      if (!res.ok) return;
      const bag = (await res.json()).bag as Bag;

      if (bag.guide_search_error) {
        setError(bag.guide_search_error);
        setStage("review");
        return;
      }
      if (bag.guide_status === "not_searched") return;

      const found = guideFromBag(bag);
      setGuide(found);
      setStage("review");
    };

    const timer = setInterval(() => void tick(), 4000);
    return () => clearInterval(timer);
  }, [stage, bagId]);

  // Carrying a dial-in forward is a brew-level action now — the fields it
  // used to fill live on coffee.brews. Kept as a hint on the confirm screen
  // until the brew form can take it directly.
  async function save() {
    if (!bagId) return;
    setStage("saving");
    setError(null);
    try {
      // The row already exists — this only records the dial-in. The guide on
      // it was written by the search and is not editable here by design.
      const res = await fetch(`/api/bags/${bagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(purchased ? { purchased_date: purchased } : {}) }),
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
          (Object.keys(EMPTY) as (keyof Identity)[]).map((key) => (
            <Field
              key={key}
              label={key.replace("_", " ")}
              value={identity[key] ?? ""}
              disabled={stage !== "confirm"}
              onChange={(v) => setIdentity({ ...identity, [key]: v })}
            />
          ))}
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
          <label className="text-sm text-ink/70 flex flex-col gap-1">
            Purchased
            <input
              type="date"
              value={purchased}
              onChange={(e) => setPurchased(e.target.value)}
              className="border border-line rounded-lg px-3 py-2 bg-surface"
            />
          </label>
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
      <div>
        <h2 className="font-semibold">{GUIDE_LABELS[guide.status]}</h2>
        {guide.status === "coffee_specific" && (
          <p className="text-xs text-ink-soft mt-1">{PRODUCT_PAGE_CAVEAT}</p>
        )}
        {guide.guide_url && (
          <a href={guide.guide_url} target="_blank" rel="noreferrer" className="text-xs text-accent underline break-all">
            {guide.guide_url}
          </a>
        )}
      </div>

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

      {guide.quotes.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink/60">What the page actually said</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {guide.quotes.map((q, i) => (
              <li key={i} className="border-l-2 border-line pl-3 text-ink/70 italic">
                &ldquo;{q.text}&rdquo;
              </li>
            ))}
          </ul>
        </details>
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
    setSaving(true);
    await fetch(`/api/bags/${bag.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    setOpen(false);
    onChanged();
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
        <div className="border-t border-line p-4 flex flex-col gap-4">
          {/* The beans link lives on the pill above, so it is reachable without
              opening the card. Only a brew guide on a *different* page needs
              one here — at tier 1 the two URLs are the same, and a second link
              to the same place is how that distinction gets lost. */}
          {bag.guide_url && bag.guide_url !== bag.product_url && (
            <a href={bag.guide_url} target="_blank" rel="noreferrer" className="text-sm text-accent underline">
              The brew guide ↗
            </a>
          )}

          <div>
            <p className="text-sm font-semibold mb-1">{GUIDE_LABELS[bag.guide_status]}</p>
            {bag.guide_status === "coffee_specific" && (
              <p className="text-xs text-ink-soft mb-2">{PRODUCT_PAGE_CAVEAT}</p>
            )}
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

          {bag.guide_quotes?.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-ink/60">What the page actually said</summary>
              <ul className="mt-2 flex flex-col gap-2">
                {bag.guide_quotes.map((q, i) => (
                  <li key={i} className="border-l-2 border-line pl-3 text-ink/70 italic">
                    &ldquo;{q.text}&rdquo;
                  </li>
                ))}
              </ul>
            </details>
          )}

          <Brews bagId={bag.id} onCount={setBrewCount} />

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <label className="text-sm text-ink/70 flex flex-col gap-1">
              Purchased
              <input
                type="date"
                value={draft.purchased_date}
                onChange={(e) => setDraft({ ...draft, purchased_date: e.target.value })}
                className="border border-line rounded-lg px-3 py-2 bg-surface"
              />
            </label>
            <label className="text-sm text-ink/70 flex flex-col gap-1">
              Notes on the coffee
              <textarea
                rows={3}
                value={draft.my_notes}
                onChange={(e) => setDraft({ ...draft, my_notes: e.target.value })}
                className="border border-line rounded-lg px-3 py-2 bg-surface"
              />
              <span className="text-xs text-ink-soft">
                What the coffee tastes like, which outlives any one brew. Per-brew observations go on the brew.
              </span>
            </label>
            {error && (
              <p className="text-sm text-urgent bg-surface border border-urgent rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              onClick={() => void save()}
              disabled={saving || deleting}
              className="bg-accent text-accent-ink rounded-lg px-3 py-2 font-medium disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>

            {/* Deleting a bag also deletes its photo and cannot be undone, so
                it asks once. The confirm replaces the button rather than
                appearing beside it — there is then no adjacent control to hit
                by accident on a phone. */}
            <div className="border-t border-line pt-3">
              {confirmingDelete ? (
                <div className="flex flex-col gap-2">
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
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="text-sm text-urgent underline"
                >
                  Delete this bag
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * The brews of one bag, and the form for adding another.
 *
 * TDS is entered in either unit and shown in both, because the reading is one
 * number — a refractometer says percent, everything else quotes ppm, and
 * 1% is 10,000ppm. Only percent is ever sent to the server; ppm is derived
 * here and derived again for display, so the two can never disagree.
 */
function Brews({ bagId, onCount }: { bagId: string; onCount: (n: number) => void }) {
  const [brews, setBrews] = useState<Brew[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<BrewDraft>(blankBrew());
  const [repeated, setRepeated] = useState(false);
  const [tdsPercent, setTdsPercent] = useState("");
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

  const pct = tdsPercent ? Number(tdsPercent) : null;
  const live = extractionYield({
    doseG: draft.dose_g ? Number(draft.dose_g) : null,
    beverageG: draft.beverage_g ? Number(draft.beverage_g) : null,
    tdsPercent: pct,
  });

  async function add() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/bags/${bagId}/brews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, tds_percent: tdsPercent || null, rating }),
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
   * Opening the form repeats the last brew on this bag. Dialling in is one
   * change at a time, so the settings you did not mean to touch should already
   * be there — see `repeatOf` for which fields carry and why the readings do
   * not.
   */
  function startAdding() {
    const previous = brews?.[0] ?? null;
    setDraft(repeatOf(previous));
    setRepeated(Boolean(previous));
    setTdsPercent("");
    setRating(null);
    setAdding(true);
  }

  function clear() {
    setDraft(blankBrew());
    setRepeated(false);
    setTdsPercent("");
    setRating(null);
  }

  async function removeBrew(id: string) {
    await fetch(`/api/brews/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <section className="flex flex-col gap-3 border-t border-line pt-4">
      <h3 className="font-medium">Brews{brews?.length ? ` (${brews.length})` : ""}</h3>

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
              {repeated ? "Settings repeated from your last brew." : "A fresh brew."}
            </p>
            <button onClick={clear} className="text-xs text-accent underline shrink-0">
              Clear
            </button>
          </div>

          <label className="text-sm text-ink/70 flex flex-col gap-1">
            Rating <span className="text-ink-soft">(optional)</span>
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

          <Inline>
            <Field label="dose (g)" value={draft.dose_g} onChange={(v) => setDraft({ ...draft, dose_g: v })} />
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

/** One logged brew, with its reading in both units. */
function BrewRow({ brew, onDelete }: { brew: Brew; onDelete: () => void }) {
  const pct = brew.tds_percent == null ? null : Number(brew.tds_percent);
  const ey = brew.extraction_yield == null ? null : Number(brew.extraction_yield);

  return (
    <div className="bg-paper border border-line rounded-xl p-3 flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">
          {brew.brewer ? MY_BREWER_LABELS[brew.brewer as MyBrewer] : "Brew"}
          {brew.brew_method ? ` · ${brew.brew_method}` : ""}
        </span>
        <span className="text-xs text-ink-soft shrink-0">{new Date(brew.brewed_at).toLocaleDateString()}</span>
      </div>

      {(brew.grinder || brew.grind_setting) && (
        <span className="text-sm text-ink/60">{[brew.grinder, brew.grind_setting].filter(Boolean).join(" · ")}</span>
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

      {brew.rating ? <span className="text-sm text-accent">{"★".repeat(brew.rating)}</span> : null}
      {brew.notes && <span className="text-sm text-ink/70">{brew.notes}</span>}

      <button onClick={onDelete} className="self-start text-xs text-urgent underline mt-1">
        Remove
      </button>
    </div>
  );
}

/** One reading, two units. Type either; percent is what gets stored. */
function TdsInput({ percent, onPercent }: { percent: string; onPercent: (v: string) => void }) {
  const asNumber = percent ? Number(percent) : null;
  return (
    <Inline>
      <Field label="TDS (%)" value={percent} onChange={onPercent} />
      <label className="text-sm text-ink/70 flex flex-col gap-1">
        TDS (ppm)
        <input
          inputMode="numeric"
          value={asNumber ? String(percentToPpm(asNumber)) : ""}
          onChange={(e) => {
            const ppm = Number(e.target.value);
            onPercent(e.target.value && Number.isFinite(ppm) ? String(ppmToPercent(ppm)) : "");
          }}
          className="border border-line rounded-lg px-3 py-2 bg-surface"
        />
      </label>
    </Inline>
  );
}

/** The margin notes: how to take the reading, and what it means. */
function BrewNotes() {
  return (
    <details className="text-xs text-ink/60 bg-surface border border-line rounded-lg px-3 py-2">
      <summary className="cursor-pointer">How to measure this</summary>
      <ul className="list-disc pl-4 mt-2 flex flex-col gap-1">
        <li>
          <strong>Extraction = (cup grams × TDS%) ÷ dose grams.</strong> Weigh the cup, not the kettle — the bed
          keeps roughly 2g of water per gram of coffee, and using water-in overstates extraction by about a tenth.
        </li>
        <li>
          <strong>TDS is strength; extraction is how much you pulled out.</strong> A drink can be strong and
          under-extracted at once. Ratio moves strength, grind moves extraction.
        </li>
        <li>
          Filter targets: TDS {TDS_TARGET.low}–{TDS_TARGET.high}%, extraction {YIELD_TARGET.low}–{YIELD_TARGET.high}%.
          Under is sour and thin, over is bitter and drying.
        </li>
        <li>
          <strong>1% = 10,000 ppm.</strong> A refractometer reads percent. Cheap conductivity pens read ppm and are
          not measuring coffee TDS — they measure dissolved ions against a water calibration, and most of what is in
          coffee is not ionic.
        </li>
        <li>Let the sample cool and filter it before reading, or it reads high.</li>
      </ul>
    </details>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="text-sm text-ink/70 flex flex-col gap-1 capitalize">
      {label}
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="border border-line rounded-lg px-3 py-2 bg-surface disabled:bg-paper disabled:text-ink/70 normal-case"
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
