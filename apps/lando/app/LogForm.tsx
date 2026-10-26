"use client";

import { useRef, useState } from "react";
import {
  COMMANDS,
  DOGS_ADD,
  DOGS_KEPT,
  DOGS_MULTIPLE,
  DOGS_NONE,
  EXERCISE_LABELS,
  FORM_LABELS,
  FUN_TYPES,
  HEALTH_LABELS,
  HEALTH_TYPES,
  InvalidEvent,
  describe,
  dogsFromPick,
  kindOfForm,
  dogsPickFor,
  LEASH,
  LEASH_LABELS,
  POTTY_WHAT,
  POTTY_WHAT_LABELS,
  UNITS,
  exercise as asExercise,
  food as asFood,
  health as asHealth,
  HEALTH_KEPT,
  eventPhotos,
  healthOptions,
  healthPickFor,
  healthReasonLabel,
  healthReasonsFromPick,
  issueChoices,
  linkedWeight,
  parseDetails,
  potty as asPotty,
  treatEntry,
  visitWeightPlan,
  weight as asWeight,
  type QueuedTreat,
  type CommandId,
  type Details,
  type Dog,
  type Leash,
  type ExerciseType,
  type FormKind,
  type HealthType,
  type JournalEvent,
  type LogKind,
  type Unit,
} from "@/lib/events";
import { amountOptions, picklist, findFood, unitLabel, type FoodType } from "@/lib/foods";
import { defaultAmount, defaultFood, type Remembered } from "@/lib/defaults";
import AmountScroller from "./AmountScroller";
import PhotoPicker, { usePhotos } from "./Photos";
import Sheet from "./Sheet";
import { dateLabel, fromDateInput, fromLocalInput, toDateInput, toLocalInput, whenLabel } from "@/lib/localtime";
import { nameBoxWidth } from "@/lib/names";

export type Person = { id: string; display_name: string };

/** What a form hands back: an event body ready for `POST /api/events`. */
export type LogBody = {
  id: string;
  kind: LogKind;
  at: string;
  person_id: string | null;
  details: Details;
  note: string | null;
  voids?: string;
};

type Props = {
  /** Which of the five forms (TEC-136): Fun and Training both save `exercise`. */
  form: FormKind;
  /** Set when correcting an entry; the form opens on its values. */
  event?: JournalEvent;
  /** A training being corrected: the treats already logged with it (`treatsWith`), shown, not changed. */
  sessionTreats?: JournalEvent[];
  people: Person[];
  /** Friends' dogs from `lando.dogs`, by name. */
  dogs: Dog[];
  /** Other dogs' "Add dog…": adds one to `lando.dogs` (or finds it) and hands it back. */
  onAddDog: (name: string) => Promise<{ dog: Dog | null; error: string | null }>;
  phonePerson: string | null;
  /** Everything the journal read, voids included: the Related issue select lists its recent medical issues (TEC-142). */
  events: JournalEvent[];
  /** Signed URLs by storage path, for the photos an entry being corrected already has. */
  photoUrls: Record<string, string>;
  /** A photo just uploaded: its signed URL, kept so the feed can show it once the entry is saved. */
  onPhotoUrl: (path: string, url: string) => void;
  remembered: Remembered;
  weightUnit: Unit;
  /**
   * A new entry: handed off at once, never awaited (charter, Never 5). `then`
   * are the training's treats, saved once the entry itself is.
   */
  onLog: (body: LogBody, then?: LogBody[]) => void;
  /** A correction or a delete: awaited, and its error shown here. `then` are saved once it succeeds. */
  onChange: (body: Record<string, unknown>, then?: LogBody[]) => Promise<{ error: string | null }>;
};

/* ── Small parts ─────────────────────────────────────────────────────────── */

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  const lbl = "text-xs uppercase tracking-[0.06em] text-ink-soft";
  return (
    <div className="grid min-w-0 gap-1">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={lbl}>
          {label}
        </label>
      ) : (
        <span className={lbl}>{label}</span>
      )}
      {children}
    </div>
  );
}

/** One choice of a few, as chips. Real radios underneath, so arrows and screen readers work. */
function Seg<T extends string>({
  name,
  value,
  options,
  onChange,
  label,
}: {
  name: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([v, text]) => (
        <label key={v} className="relative">
          <input
            type="radio"
            name={name}
            value={v}
            checked={value === v}
            onChange={() => onChange(v)}
            className="peer absolute opacity-0"
          />
          <span className="block cursor-pointer whitespace-nowrap rounded-full border border-line bg-surface px-3.5 py-2 peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-ink peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pinstripe">
            {text}
          </span>
        </label>
      ))}
    </div>
  );
}

const input =
  "w-full min-w-0 rounded-[10px] border border-line bg-paper px-2.5 py-2.5 outline-none focus:border-accent";

const WHERE_OPTS = [
  ["outside", "Outside"],
  ["inside", "Inside"],
] as const;

/* ── The form ────────────────────────────────────────────────────────────── */

/** Chips that toggle, several at once. Real checkboxes underneath. */
function Chips<T extends string>({
  label,
  options,
  picked,
  onChange,
}: {
  label: string;
  options: readonly (readonly [T, string])[];
  picked: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([id, text]) => (
        <label key={id} className="relative">
          <input
            type="checkbox"
            checked={picked.includes(id)}
            onChange={(e) => onChange(e.target.checked ? [...picked, id] : picked.filter((c) => c !== id))}
            className="peer absolute opacity-0"
          />
          <span className="block cursor-pointer whitespace-nowrap rounded-full border border-line bg-surface px-3.5 py-2 peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-ink peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pinstripe">
            {text}
          </span>
        </label>
      ))}
    </div>
  );
}

export default function LogForm({
  form,
  event,
  sessionTreats = [],
  people,
  dogs,
  onAddDog,
  phonePerson,
  events,
  photoUrls,
  onPhotoUrl,
  remembered,
  weightUnit,
  onLog,
  onChange,
}: Props) {
  const kind: LogKind = kindOfForm(form);
  const editing = !!event;
  const openedAt = useRef(new Date().toISOString());
  // A weight is a day, not a moment: its When picks a date, stored at local noon.
  const dateOnly = kind === "weight";
  // Health, Fun, Training and Potty take photos (TEC-137, TEC-139, TEC-142).
  const hasPhotos = kind === "health" || kind === "exercise" || kind === "potty";

  // Common
  const [when, setWhen] = useState(toLocalInput(event?.at ?? openedAt.current));
  const [day, setDay] = useState(toDateInput(event?.at ?? openedAt.current));
  const [whenTouched, setWhenTouched] = useState(false);
  const [personId, setPersonId] = useState(event ? event.person_id ?? "" : phonePerson ?? "");
  const [note, setNote] = useState(event?.note ?? "");

  // Potty
  const p = event?.kind === "potty" ? asPotty(event) : null;
  const [what, setWhat] = useState(p?.what ?? "pee");
  const [where, setWhere] = useState(p?.where ?? (event?.kind === "exercise" ? asExercise(event).where : "outside"));
  // Leashed by default. An outside entry from before the pick existed opens
  // with nothing picked, so a correction never invents one.
  const [leash, setLeash] = useState<Leash | "">(p ? (p.leash ?? (p.where === "inside" ? "leashed" : "")) : "leashed");

  // Food
  const f = event?.kind === "food" ? asFood(event) : null;
  const [foodType, setFoodType] = useState<FoodType>(f?.type ?? "meal");
  const [itemId, setItemId] = useState(f?.item_id ?? defaultFood("meal", remembered));
  // An amount from the ⅛ scroller (TEC-136). The amount it opened on stays on
  // the list even when it is not an eighth (an older 1/3), so an untouched
  // correction keeps it.
  const [amount, setAmount] = useState<number | null>(f ? f.amount : defaultAmount("meal", remembered));
  const [openedAmount] = useState(amount);

  // Exercise: Fun is a walk or playtime; Training is always training (TEC-136).
  const x = event?.kind === "exercise" ? asExercise(event) : null;
  const [exType, setExType] = useState<ExerciseType>(form === "training" ? "training" : x?.type ?? "walk");
  // Training's Treats pop-up: treats picked here are saved with the session.
  const [treatQueue, setTreatQueue] = useState<QueuedTreat[]>([]);
  const [treatOpen, setTreatOpen] = useState(false);
  const [treatItem, setTreatItem] = useState(defaultFood("treat", remembered));
  const [treatAmount, setTreatAmount] = useState<number | null>(defaultAmount("treat", remembered));
  // One pick (TEC-129): None, a dog, or Multiple; picking is the answer to
  // "with other dogs", there is no Yes/No. An entry with `with_dogs` and no
  // ids (Multiple, or from before the list) opens on Multiple, which saves
  // the same. An entry naming several dogs (TEC-125's multi-select), or one
  // no longer listed, opens on those as they were and keeps them until
  // another pick is made.
  const [{ pick: firstDogPick, kept: keptDogs }] = useState(() => dogsPickFor(x, dogs));
  const [dogPick, setDogPick] = useState(firstDogPick);
  const keptLabel = keptDogs?.map((id) => dogs.find((d) => d.id === id)?.name ?? "another dog").join(", ") ?? "";
  const [addingDog, setAddingDog] = useState(false);
  const [dogName, setDogName] = useState("");
  const [dogError, setDogError] = useState<string | null>(null);
  const [dogBusy, setDogBusy] = useState(false);
  const [minutes, setMinutes] = useState(String(x?.minutes ?? 15));
  const [treats, setTreats] = useState(String(x?.treats ?? 0));
  const [commands, setCommands] = useState<CommandId[]>(x?.commands ?? []);

  // Weight
  const w = event?.kind === "weight" ? asWeight(event) : null;
  const [value, setValue] = useState(w ? String(w.value) : "");
  const [unit, setUnit] = useState<Unit>(w?.unit ?? remembered.unit ?? weightUnit);

  // Health (TEC-137): a vet visit or a medical issue, picks from a fixed list, photos on both.
  const h = event?.kind === "health" ? asHealth(event) : null;
  // A vet visit's optional Weight (TEC-151). It opens empty, in this phone's last
  // unit; a correction opens on the weight already saved with the visit, and
  // changing it corrects that entry rather than adding a second.
  const [linked] = useState(() => (event && h?.type === "vet" ? linkedWeight(events, event.id) : null));
  const [visitValue, setVisitValue] = useState(linked ? String(asWeight(linked).value) : "");
  const [visitUnit, setVisitUnit] = useState<Unit>(linked ? asWeight(linked).unit : remembered.unit ?? weightUnit);
  const [healthType, setHealthType] = useState<HealthType>(h?.type ?? "vet");
  // Related issue (TEC-142), on Potty and on a vet visit: the id of a medical
  // issue, or none. A correction opens on the stored link and keeps it unless
  // it is changed; `issueChoices` adds it as an option when the list would not.
  const [firstIssue] = useState(p?.issue ?? h?.issue ?? "");
  const [issue, setIssue] = useState(firstIssue);
  const issueOptions = issueChoices(events, firstIssue || null);
  // One high-level pick (TEC-139). An entry from before it, with several or
  // retired reasons, opens on them as a kept option and saves them unchanged
  // until another pick is made.
  const [{ pick: firstReason, kept: keptReasons }] = useState(() => healthPickFor(h));
  const [reason, setReason] = useState(firstReason);
  // Photos (TEC-137, and Fun and Training since TEC-139). A correction opens
  // with the photos the entry has and keeps whatever is not removed.
  const photos = usePhotos(event ? eventPhotos(event) : [], photoUrls, onPhotoUrl);

  function pickHealthType(t: HealthType) {
    setHealthType(t);
    // The lists differ; "Other" is in both and survives the switch. The kept
    // reasons belong to the type the entry had, so they do not.
    setReason((r) => (healthOptions(t).some(([v]) => v === r) ? r : ""));
  }

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Fixed when the form opens, so pressing Save again after a lost response
  // is the same row, never a second one.
  const saveId = useRef(crypto.randomUUID());
  const deleteId = useRef(crypto.randomUUID());
  // The visit's weight is its own entry; its id is fixed too, so a retry is the same row.
  const visitWeightId = useRef(crypto.randomUUID());

  function pickFoodType(t: FoodType) {
    setFoodType(t);
    setItemId(defaultFood(t, remembered));
    setAmount(defaultAmount(t, remembered));
  }

  function openTreat() {
    setTreatItem(defaultFood("treat", remembered));
    setTreatAmount(defaultAmount("treat", remembered));
    setTreatOpen(true);
  }

  /** The pop-up's Add: queue the treat and count it on the session. */
  function addTreat() {
    setTreatQueue((q) => [...q, { id: crypto.randomUUID(), item_id: treatItem, amount: treatAmount }]);
    setTreats((n) => String((Number(n) || 0) + 1));
    setTreatOpen(false);
  }

  function dropTreat(id: string) {
    setTreatQueue((q) => q.filter((t) => t.id !== id));
    setTreats((n) => String(Math.max(0, (Number(n) || 0) - 1)));
  }

  /** "Freeze-dried beef hearts · 2 pieces", as the feed will read it. */
  const treatLabel = (t: QueuedTreat) => {
    const item = findFood("treat", t.item_id);
    const details = { type: "treat", item_id: t.item_id, item_name: item?.name ?? "Treat", unit: item?.unit ?? null, amount: t.amount };
    return describe({ kind: "food", details }).detail;
  };

  async function addDog(e: { preventDefault(): void }) {
    e.preventDefault();
    setDogError(null);
    setDogBusy(true);
    const { dog, error } = await onAddDog(dogName);
    setDogBusy(false);
    if (!dog) {
      setDogError(error ?? "couldn't add");
      return;
    }
    setDogPick(dog.id);
    setAddingDog(false);
    setDogName("");
  }

  const item = findFood(foodType, itemId);
  const amountUnit = item?.unit ? unitLabel(item.unit, amount ?? 2) : null;
  const treatFood = findFood("treat", treatItem);

  function rawDetails(): Record<string, unknown> {
    switch (kind) {
      case "potty":
        return {
          what,
          where,
          ...(where === "outside" && leash ? { leash } : {}),
          ...(issue ? { issue } : {}),
          ...(photos.paths.length ? { photos: photos.paths } : {}),
        };
      case "food":
        return { type: foodType, item_id: itemId, amount };
      case "exercise":
        return {
          type: exType,
          where,
          minutes: Number(minutes),
          treats: Number(treats || 0),
          ...(exType === "training" ? { commands } : {}),
          ...dogsFromPick(dogPick, keptDogs),
          ...(photos.paths.length ? { photos: photos.paths } : {}),
        };
      case "weight":
        // A weight saved from a vet visit keeps its link when corrected here (TEC-151).
        return { value: Number(value.replace(",", ".")), unit, ...(w?.visit ? { visit: w.visit } : {}) };
      case "health":
        return {
          type: healthType,
          reasons: healthReasonsFromPick(reason === HEALTH_KEPT && h?.type !== healthType ? "" : reason, keptReasons),
          ...(healthType === "vet" && issue ? { issue } : {}),
          ...(photos.paths.length ? { photos: photos.paths } : {}),
        };
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Never saved around a photo: it is uploaded, or the person removes it.
    if (hasPhotos && (photos.working || photos.failed)) {
      setError(photos.failed ? "A photo didn't upload — retry it, or remove it." : "A photo is still uploading.");
      return;
    }
    // The pick is the headline; the note is the story, and it is required (TEC-139).
    if (kind === "health" && !note.trim()) {
      setError("Say what happened — the note is required.");
      return;
    }
    let details: Details;
    try {
      // The same check the server makes, so a mistake is caught before the sheet closes.
      details = parseDetails(kind, rawDetails());
    } catch (err) {
      setError(err instanceof InvalidEvent ? err.message : "check the form");
      return;
    }
    // An untouched "when" on a new entry means the moment Save was pressed.
    // A weight's is today, at local noon like every weight. An untouched
    // correction keeps the entry's own time to the millisecond (the input
    // holds minutes only), so the treats logged with a training still match it.
    const at = dateOnly
      ? fromDateInput(!editing && !whenTouched ? toDateInput(new Date().toISOString()) : day)
      : !whenTouched
        ? (event?.at ?? new Date().toISOString())
        : fromLocalInput(when);
    if (!at) {
      setError("pick a time");
      return;
    }
    const body: LogBody = {
      id: saveId.current,
      kind,
      at,
      person_id: personId || null,
      details,
      note: note.trim() || null,
    };
    // Treats from the pop-up: food entries at the session's time and person,
    // saved after the session itself (TEC-136).
    let then: LogBody[] = [];
    try {
      then = treatQueue.map((t) => treatEntry(t, at, body.person_id));
      // A vet visit's Weight, saved after the visit (TEC-151); a Medical issue has none.
      if (kind === "health" && healthType === "vet") {
        then = visitWeightPlan({
          typed: visitValue,
          unit: visitUnit,
          linked,
          weightId: visitWeightId.current,
          visitId: body.id,
          visitAt: at,
          personId: body.person_id,
        });
      }
    } catch (err) {
      setError(err instanceof InvalidEvent ? err.message : "check the form");
      return;
    }
    if (!editing) {
      onLog(body, then);
      return;
    }
    setBusy(true);
    const { error } = await onChange({ ...body, voids: event.id }, then);
    setBusy(false);
    if (error) setError(error);
  }

  async function remove() {
    if (!event) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    const { error } = await onChange({ id: deleteId.current, kind: "void", voids: event.id, person_id: personId || null });
    setBusy(false);
    if (error) setError(error);
  }

  // "Save walk", "Save playtime", "Save training", "Save potty"…
  const title =
    form === "fun" ? EXERCISE_LABELS[exType] : form === "health" ? HEALTH_LABELS[healthType] : FORM_LABELS[form];
  const photoBlock = hasPhotos && (photos.working || photos.failed);

  // The Related issue select, on Potty and on a vet visit (TEC-142): None, then
  // recent live medical issues, newest first, by date and pick.
  const relatedIssue = (
    <Field label="Related issue" htmlFor="f-issue">
      <select id="f-issue" value={issue} onChange={(e) => setIssue(e.target.value)} className={input}>
        <option value="">None</option>
        {issueOptions.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      {kind === "potty" && (
        <>
          <Field label="What">
            <Seg name="what" label="What" value={what} onChange={setWhat} options={POTTY_WHAT.map((v) => [v, POTTY_WHAT_LABELS[v]] as const)} />
          </Field>
          <Field label="Where">
            <Seg name="where" label="Where" value={where} onChange={setWhere} options={WHERE_OPTS} />
          </Field>
          {where === "outside" && (
            <Field label="Leash">
              <Seg
                name="leash"
                label="Leash"
                value={leash}
                onChange={setLeash}
                options={LEASH.map((l) => [l, LEASH_LABELS[l]] as const)}
              />
            </Field>
          )}
          {where === "inside" && what !== "none" && (
            <p className="text-[13px] font-semibold text-danger">Inside counts as an accident.</p>
          )}
          {relatedIssue}
          <PhotoPicker photos={photos} />
        </>
      )}

      {kind === "food" && (
        <>
          <Field label="Type">
            <Seg name="type" label="Type" value={foodType} onChange={pickFoodType} options={[["meal", "Meal"], ["treat", "Treat"]] as const} />
          </Field>
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
            <Field label="What" htmlFor="f-item">
              <select id="f-item" value={itemId} onChange={(e) => setItemId(e.target.value)} className={input}>
                {/* A retired item stays selectable on the entry that already has it. */}
                {(item && !picklist(foodType).includes(item) ? [item, ...picklist(foodType)] : picklist(foodType)).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={amountUnit ? `Amount (${amountUnit})` : "Amount"} htmlFor="f-amount">
              <AmountScroller
                id="f-amount"
                label={amountUnit ? `Amount in ${amountUnit}` : "Amount"}
                options={amountOptions(openedAmount, defaultAmount("meal", remembered))}
                value={amount}
                onChange={setAmount}
              />
            </Field>
          </div>
          {item?.unit === null && <p className="-mt-2 text-[13px] text-ink-soft">Misc: say what it was in the note.</p>}
        </>
      )}

      {kind === "exercise" && (
        <>
          {/* Fun picks walk or playtime; Training has no Type (TEC-136). */}
          {form === "fun" && (
            <Field label="Type">
              <Seg
                name="type"
                label="Type"
                value={exType}
                onChange={setExType}
                options={FUN_TYPES.map((t) => [t, EXERCISE_LABELS[t]] as const)}
              />
            </Field>
          )}
          <Field label="Where">
            <Seg name="where" label="Where" value={where} onChange={setWhere} options={WHERE_OPTS} />
          </Field>
          <Field label="Other dogs" htmlFor={addingDog ? "f-dog-name" : "f-dogs"}>
            {addingDog ? (
              /* Not a nested <form> (HTML has none): Enter here adds the dog
                 rather than saving the session. */
              <div className="flex min-w-0 items-center gap-2">
                <input
                  id="f-dog-name"
                  autoFocus
                  value={dogName}
                  onChange={(e) => setDogName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addDog(e);
                  }}
                  maxLength={40}
                  placeholder="Dog's name"
                  className={`${input} flex-1`}
                />
                <button
                  type="button"
                  onClick={(e) => void addDog(e)}
                  disabled={dogBusy}
                  className="rounded-[10px] bg-accent px-3 py-2.5 font-medium text-accent-ink disabled:opacity-60"
                >
                  {dogBusy ? "Adding…" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingDog(false);
                    setDogError(null);
                  }}
                  className="text-ink-soft"
                >
                  Cancel
                </button>
              </div>
            ) : (
              /* One pick (TEC-129): every dog by name, then Multiple, then
                 Add dog. Add dog never becomes the value: it opens the name
                 box and the pick stays where it was until a dog is added. */
              <select
                id="f-dogs"
                value={dogPick}
                onChange={(e) => {
                  if (e.target.value === DOGS_ADD) {
                    setAddingDog(true);
                    setDogError(null);
                  } else setDogPick(e.target.value);
                }}
                className={input}
              >
                <option value={DOGS_NONE}>None</option>
                {keptDogs && <option value={DOGS_KEPT}>{keptLabel}</option>}
                {dogs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
                <option value={DOGS_MULTIPLE}>Multiple</option>
                <option value={DOGS_ADD}>Add dog…</option>
              </select>
            )}
            {dogError && <p className="text-[13px] font-semibold text-danger">{dogError}</p>}
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Length (min)" htmlFor="f-mins">
              <input id="f-mins" type="number" inputMode="numeric" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={input} />
            </Field>
            <Field label="Treats used" htmlFor="f-treats">
              <div className="flex min-w-0 gap-1.5">
                <input id="f-treats" type="number" inputMode="numeric" min={0} max={500} value={treats} onChange={(e) => setTreats(e.target.value)} className={`${input} flex-1`} />
                {form === "training" && (
                  /* Training's Treats pop-up (TEC-136): pick what and how much;
                     it is logged as a food treat when the session is saved. */
                  <button
                    type="button"
                    onClick={openTreat}
                    aria-label="Log a treat"
                    className="shrink-0 rounded-[10px] bg-accent px-3 font-semibold text-accent-ink"
                  >
                    + Treat
                  </button>
                )}
              </div>
            </Field>
          </div>
          {form === "training" && (sessionTreats.length > 0 || treatQueue.length > 0) && (
            <ul aria-label="Treats with this session" className="-mt-1 flex flex-col gap-1 text-[13px]">
              {sessionTreats.map((t) => (
                <li key={t.id} className="text-ink-soft">
                  Logged: {describe(t).detail}
                </li>
              ))}
              {treatQueue.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">To log on save: {treatLabel(t)}</span>
                  <button type="button" onClick={() => dropTreat(t.id)} aria-label="Remove this treat" className="px-2 py-1 text-ink-soft">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {exType === "training" && (
            <Field label="Commands practised">
              <Chips label="Commands practised" options={COMMANDS} picked={commands} onChange={setCommands} />
            </Field>
          )}
          <PhotoPicker photos={photos} />
          {treatOpen && (
            <Sheet title="Treat" onClose={() => setTreatOpen(false)} nested>
              <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
                <Field label="What" htmlFor="t-item">
                  <select id="t-item" value={treatItem} onChange={(e) => setTreatItem(e.target.value)} className={input}>
                    {picklist("treat").map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={treatFood?.unit ? `Amount (${unitLabel(treatFood.unit, treatAmount ?? 2)})` : "Amount"} htmlFor="t-amount">
                  <AmountScroller
                    id="t-amount"
                    label={treatFood?.unit ? `Amount in ${unitLabel(treatFood.unit, treatAmount ?? 2)}` : "Amount"}
                    options={amountOptions(defaultAmount("treat", remembered))}
                    value={treatAmount}
                    onChange={setTreatAmount}
                  />
                </Field>
              </div>
              <p className="text-[13px] text-ink-soft">
                Logged as a treat at this session&apos;s time when you save it, and counted in Treats used.
              </p>
              <button
                type="button"
                data-autofocus
                onClick={addTreat}
                className="rounded-[14px] bg-[var(--tone-2-bg)] px-4 py-3 text-lg font-bold text-[var(--tone-2-ink)] shadow-[0_4px_0_var(--tone-2-lip)] active:translate-y-0.5 active:shadow-[0_2px_0_var(--tone-2-lip)]"
              >
                Add treat
              </button>
            </Sheet>
          )}
        </>
      )}

      {kind === "weight" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Weight" htmlFor="f-value">
            <input
              id="f-value"
              data-autofocus
              type="number"
              inputMode="decimal"
              step="0.1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="7.0"
              className={input}
            />
          </Field>
          <Field label="Unit">
            <Seg name="unit" label="Unit" value={unit} onChange={setUnit} options={UNITS.map((u) => [u, u] as const)} />
          </Field>
        </div>
      )}

      {kind === "health" && (
        <>
          <Field label="Type">
            <Seg
              name="health-type"
              label="Type"
              value={healthType}
              onChange={pickHealthType}
              options={HEALTH_TYPES.map((t) => [t, HEALTH_LABELS[t]] as const)}
            />
          </Field>
          {/* One plain select, like Other dogs (TEC-139); the detail goes in the note. */}
          <Field label={healthType === "vet" ? "Why" : "What"} htmlFor="f-reason">
            <select id="f-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={input}>
              <option value="">Pick one…</option>
              {keptReasons && h?.type === healthType && (
                <option value={HEALTH_KEPT}>{keptReasons.map((id) => healthReasonLabel(healthType, id)).join(", ")}</option>
              )}
              {healthOptions(healthType).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {healthType === "vet" && relatedIssue}
          {healthType === "vet" && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Weight (optional)" htmlFor="f-visit-weight">
                <input
                  id="f-visit-weight"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={visitValue}
                  onChange={(e) => setVisitValue(e.target.value)}
                  placeholder="7.0"
                  className={input}
                />
              </Field>
              <Field label="Unit">
                <Seg name="visit-unit" label="Unit" value={visitUnit} onChange={setVisitUnit} options={UNITS.map((u) => [u, u] as const)} />
              </Field>
            </div>
          )}
          <Field label="Note" htmlFor="f-note">
            <input
              id="f-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              required
              aria-required="true"
              placeholder="What happened?"
              className={input}
            />
          </Field>
          <PhotoPicker photos={photos} />
        </>
      )}

      {/* When takes the row; Human is as wide as the longest name (TEC-129). */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Field label="When" htmlFor="f-when">
          {/* The native control is wider than half a phone and pushed into
              Human, so a short label shows instead. The real input sits over
              it, transparent: a tap opens the phone's own picker, and focus,
              screen readers and keyboard editing still reach the input. */}
          <div className="relative min-w-0 rounded-[10px] border border-line bg-paper focus-within:border-accent">
            <span aria-hidden="true" className="block truncate px-2.5 py-2.5 tabular-nums">
              {dateOnly
                ? dateLabel(day, new Date()) || "Pick a date"
                : !editing && !whenTouched
                  ? "Now"
                  : whenLabel(when, new Date()) || "Pick a time"}
            </span>
            <input
              id="f-when"
              type={dateOnly ? "date" : "datetime-local"}
              value={dateOnly ? day : when}
              max={dateOnly ? toDateInput(new Date().toISOString()) : undefined}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker();
                } catch {
                  // Not supported, or not from a tap: the native control still edits.
                }
              }}
              onChange={(e) => {
                if (dateOnly) setDay(e.target.value);
                else setWhen(e.target.value);
                setWhenTouched(true);
              }}
              className="absolute inset-0 h-full w-full min-w-0 cursor-pointer opacity-0"
            />
          </div>
        </Field>
        <Field label="Human" htmlFor="f-who">
          <select
            id="f-who"
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            className={input}
            style={{ width: nameBoxWidth(people.map((p) => p.display_name)) }}
          >
            <option value="">Nobody</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {/* Health has its Note under the pick, and requires it. */}
      {kind !== "health" && (
        <Field label="Note" htmlFor="f-note">
          <input id="f-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Optional" className={input} />
        </Field>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || photoBlock}
        data-autofocus={kind === "weight" && !editing ? undefined : true}
        className="rounded-[14px] bg-[var(--tone-2-bg)] px-4 py-3 text-lg font-bold text-[var(--tone-2-ink)] shadow-[0_4px_0_var(--tone-2-lip)] active:translate-y-0.5 active:shadow-[0_2px_0_var(--tone-2-lip)] disabled:opacity-60"
      >
        {busy
          ? "Saving…"
          : photos.working && hasPhotos
            ? "Uploading photo…"
            : photos.failed && hasPhotos
              ? "Fix the photo to save"
              : editing
                ? "Save changes"
                : `Save ${title.toLowerCase()}`}
      </button>
      {editing ? (
        <button type="button" onClick={remove} disabled={busy} className="self-start py-1 font-semibold text-danger disabled:opacity-60">
          {confirmDelete ? "Tap again to delete" : "Delete this entry"}
        </button>
      ) : (
        <p className="text-[13px] text-ink-soft">Defaults are filled in. Change only what&apos;s different.</p>
      )}
    </form>
  );
}
