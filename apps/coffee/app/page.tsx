"use client";

import { useCallback, useEffect, useState } from "react";
import { downscale } from "@/lib/image";
import { BREW_METHODS, METHOD_LABELS, type BrewMethod } from "@/lib/methods";
import type { Guide, GuideStatus } from "@/lib/guide";

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
  my_method: string | null;
  my_grinder: string | null;
  my_grind_setting: string | null;
  my_notes: string | null;
  my_rating: number | null;
  created_at: string;
};

type PreviousBag = {
  id: string;
  my_method: string | null;
  my_grinder: string | null;
  my_grind_setting: string | null;
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
  coffee_specific: "The roaster's recipe for this coffee",
  roaster_generic: "The roaster's house method — not specific to this coffee",
  none: "No published instructions",
  not_searched: "Not searched",
};

export default function CoffeePage() {
  const [tab, setTab] = useState<"scan" | "library">("scan");
  const [bags, setBags] = useState<Bag[]>([]);
  const [query, setQuery] = useState("");

  const loadBags = useCallback(async (q: string) => {
    const res = await fetch(`/api/bags${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    if (res.ok) setBags((await res.json()).bags ?? []);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadBags(query), query ? 250 : 0);
    return () => clearTimeout(t);
  }, [query, loadBags]);

  return (
    <main className="min-h-screen">
      <header className="bg-ink text-paper px-4 py-3 flex items-center gap-2 border-b-4 border-accent">
        <span aria-hidden>☕</span>
        <h1 className="font-semibold">Coffee</h1>
      </header>

      <nav className="flex border-b border-line bg-white">
        {(["scan", "library"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-4 py-3 text-sm font-medium capitalize ${
              tab === t ? "text-accent border-b-2 border-accent" : "text-ink/60"
            }`}
          >
            {t === "scan" ? "Scan a bag" : `Library${bags.length ? ` (${bags.length})` : ""}`}
          </button>
        ))}
      </nav>

      <div className="px-4 py-5 max-w-2xl mx-auto">
        {tab === "scan" ? (
          <Scan
            onSaved={() => {
              setTab("library");
              void loadBags(query);
            }}
          />
        ) : (
          <Library bags={bags} query={query} setQuery={setQuery} onChanged={() => void loadBags(query)} />
        )}
      </div>
    </main>
  );
}

function Scan({ onSaved }: { onSaved: () => void }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [myMethod, setMyMethod] = useState<BrewMethod | "">("");
  const [stage, setStage] = useState<"idle" | "reading" | "confirm" | "searching" | "review" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [previous, setPrevious] = useState<PreviousBag | null>(null);
  const [carried, setCarried] = useState(false);
  const [dialIn, setDialIn] = useState({ my_grinder: "", my_grind_setting: "" });

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

  async function search() {
    if (!identity?.roaster || !identity?.coffee_name) {
      setError("A roaster and a coffee name are needed to search.");
      return;
    }
    setError(null);
    setStage("searching");
    void lookForPrevious(identity.roaster, identity.coffee_name);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roaster: identity.roaster, coffee_name: identity.coffee_name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The search failed.");
      setGuide(data.guide as Guide);
      if ((data.guide as Guide).method) setMyMethod((data.guide as Guide).method as BrewMethod);
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The search failed.");
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

  function carryForward() {
    if (!previous) return;
    if (previous.my_method) setMyMethod(previous.my_method as BrewMethod);
    setDialIn({
      my_grinder: previous.my_grinder ?? "",
      my_grind_setting: previous.my_grind_setting ?? "",
    });
    setCarried(true);
  }

  async function save() {
    if (!identity) return;
    setStage("saving");
    setError(null);
    try {
      const body = new FormData();
      for (const [k, v] of Object.entries(identity)) if (v) body.append(k, v);
      if (photo) body.append("photo", photo);
      if (guide) body.append("guide", JSON.stringify(guide));
      if (myMethod) body.append("my_method", myMethod);
      for (const [k, v] of Object.entries(dialIn)) if (v) body.append(k, v);

      const res = await fetch("/api/bags", { method: "POST", body });
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
        <label className="border-2 border-dashed border-line rounded-2xl bg-white py-14 text-center cursor-pointer">
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
    return <Busy label="Looking for the roaster's instructions…" hint="Checking this coffee's page, then their brew guide." />;
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="The bag" className="rounded-xl w-full max-h-64 object-contain bg-white border border-line" />
      )}

      <section className="bg-white border border-line rounded-2xl p-4 flex flex-col gap-3">
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
        <button
          onClick={() => void search()}
          className="bg-accent text-white rounded-xl px-4 py-3 font-medium"
        >
          Find brewing instructions
        </button>
      )}

      {stage !== "confirm" && guide && <GuideCard guide={guide} />}

      {stage !== "confirm" && previous && (
        <section className="bg-white border border-accent rounded-2xl p-4 flex flex-col gap-2">
          <h2 className="font-medium">You&apos;ve had this before</h2>
          <p className="text-sm text-ink/70">
            Bought {new Date(previous.created_at).toLocaleDateString()}, dialled in on{" "}
            {[
              previous.my_method ? METHOD_LABELS[previous.my_method as BrewMethod] : null,
              previous.my_grinder,
              previous.my_grind_setting,
            ]
              .filter(Boolean)
              .join(" · ")}
            .
          </p>
          {carried ? (
            <p className="text-sm text-ink/60">Carried over. Edit anything below.</p>
          ) : (
            <button onClick={carryForward} className="self-start text-sm text-accent underline">
              Start from that
            </button>
          )}
        </section>
      )}

      {stage !== "confirm" && (
        <section className="bg-white border border-line rounded-2xl p-4 flex flex-col gap-3">
          <h2 className="font-medium">How you&apos;ll brew it</h2>
          <label className="text-sm text-ink/70 flex flex-col gap-1">
            Brew method
            <select
              value={myMethod}
              onChange={(e) => setMyMethod(e.target.value as BrewMethod)}
              className="border border-line rounded-lg px-3 py-2 bg-white"
            >
              <option value="">—</option>
              {BREW_METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          {guide?.method && myMethod === guide.method && !carried && (
            <p className="text-xs text-ink/50">Pre-filled from the roaster&apos;s recommendation. Change it freely.</p>
          )}
          <Field
            label="grinder"
            value={dialIn.my_grinder}
            onChange={(v) => setDialIn({ ...dialIn, my_grinder: v })}
          />
          <Field
            label="grind setting"
            value={dialIn.my_grind_setting}
            onChange={(v) => setDialIn({ ...dialIn, my_grind_setting: v })}
          />
        </section>
      )}

      {stage !== "confirm" && (
        <button
          onClick={() => void save()}
          disabled={stage === "saving"}
          className="bg-accent text-white rounded-xl px-4 py-3 font-medium disabled:opacity-60"
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
    <section className="bg-white border border-line rounded-2xl p-4 flex flex-col gap-3">
      <div>
        <h2 className="font-medium">{GUIDE_LABELS[guide.status]}</h2>
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
        <p className="text-xs text-ink/50">
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
  onChanged,
}: {
  bags: Bag[];
  query: string;
  setQuery: (q: string) => void;
  onChanged: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search roaster, coffee, origin, notes"
        className="w-full border border-line rounded-xl px-3 py-2 bg-white outline-none focus:border-accent"
      />
      {bags.length === 0 ? (
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
  const [draft, setDraft] = useState({
    my_method: bag.my_method ?? "",
    my_grinder: bag.my_grinder ?? "",
    my_grind_setting: bag.my_grind_setting ?? "",
    my_notes: bag.my_notes ?? "",
    my_rating: bag.my_rating ? String(bag.my_rating) : "",
  });

  async function save() {
    setSaving(true);
    await fetch(`/api/bags/${bag.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        my_rating: draft.my_rating ? Number(draft.my_rating) : null,
      }),
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
    <article className="bg-white border border-line rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex gap-3 p-3 text-left items-center">
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
        {bag.my_rating && <span className="text-sm shrink-0">{"★".repeat(bag.my_rating)}</span>}
      </button>

      {open && (
        <div className="border-t border-line p-4 flex flex-col gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink/50 mb-1">{GUIDE_LABELS[bag.guide_status]}</p>
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
            {bag.product_url && (
              <a href={bag.product_url} target="_blank" rel="noreferrer" className="text-xs text-accent underline break-all block mt-2">
                Bag page
              </a>
            )}
            {bag.guide_url && bag.guide_url !== bag.product_url && (
              <a href={bag.guide_url} target="_blank" rel="noreferrer" className="text-xs text-accent underline break-all block">
                Brew guide
              </a>
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

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <label className="text-sm text-ink/70 flex flex-col gap-1">
              Brew method
              <select
                value={draft.my_method}
                onChange={(e) => setDraft({ ...draft, my_method: e.target.value })}
                className="border border-line rounded-lg px-3 py-2 bg-white"
              >
                <option value="">—</option>
                {BREW_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <Field label="grinder" value={draft.my_grinder} onChange={(v) => setDraft({ ...draft, my_grinder: v })} />
            <Field
              label="grind setting"
              value={draft.my_grind_setting}
              onChange={(v) => setDraft({ ...draft, my_grind_setting: v })}
            />
            <label className="text-sm text-ink/70 flex flex-col gap-1">
              Rating
              <select
                value={draft.my_rating}
                onChange={(e) => setDraft({ ...draft, my_rating: e.target.value })}
                className="border border-line rounded-lg px-3 py-2 bg-white"
              >
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ink/70 flex flex-col gap-1">
              Notes
              <textarea
                rows={3}
                value={draft.my_notes}
                onChange={(e) => setDraft({ ...draft, my_notes: e.target.value })}
                className="border border-line rounded-lg px-3 py-2 bg-white"
              />
            </label>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="bg-accent text-white rounded-lg px-3 py-2 font-medium disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </article>
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
        className="border border-line rounded-lg px-3 py-2 bg-white disabled:bg-paper disabled:text-ink/70 normal-case"
      />
    </label>
  );
}

function Busy({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="text-center py-16">
      <p className="font-medium">{label}</p>
      {hint && <p className="text-sm text-ink/60 mt-1">{hint}</p>}
    </div>
  );
}

function stripNulls(identity: Identity): Partial<Identity> {
  return Object.fromEntries(Object.entries(identity ?? {}).filter(([, v]) => v != null)) as Partial<Identity>;
}
