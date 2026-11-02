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
  OUT_MINUTES_CHIPS,
  funPotty,
  leashOptions,
  outMinutesLabel,
  spotOptions,
  POTTY_WHAT,
  POTTY_WHAT_LABELS,
  UNITS,
  exercise as asExercise,
  food as asFood,
  health as asHealth,
  HEALTH_KEPT,
  eventNames,
  eventPhotos,
  healthOptions,
  healthPickFor,
  healthReasonLabel,
  healthReasonsFromPick,
  issueChoices,
  linkedWeight,
  parseDetails,
  parseNewFood,
  parseNewMedication,
  potty as asPotty,
  inlineTreatEntries,
  outMinutesAria,
  outMinutesChip,
  visitWeightPlan,
  weight as asWeight,
  type CommandId,
  type Details,
  type Dog,
  type Leash,
  type Spot,
  type ExerciseType,
  type FormKind,
  type HealthType,
  type JournalEvent,
  type LogKind,
  type QuickLog,
  type PottyWhat,
  type Unit,
} from "@/lib/events";
import { FOOD_UNITS, MISC_ID, amountOptions, picklist, findFood, treatQtyError, unitLabel, type AddedFood, type FoodType, type FoodUnit, type ListType } from "@/lib/foods";
import { MED_ROUTES, MED_UNITS, findMedication, medPicklist, type MedRoute, type MedUnit, type Medication } from "@/lib/medications";
import { FUTURE_NOTICE, donePrefill, doneWhen, futureItem, isFutureDay, isFutureWhen, type DonePrefill } from "@/lib/future";
import { REPEAT_MAX, REPEAT_UNITS, type RepeatUnit, type Upcoming, type UpcomingInput } from "@/lib/upcoming";
import { defaultAmount, defaultFood, type Remembered } from "@/lib/defaults";
import AmountScroller from "./AmountScroller";
import TreatQty from "./TreatQty";
import TreatCount from "./TreatCount";
import PhotoPicker, { usePhotos } from "./Photos";
import { clockTime, dateLabel, fromDateInput, fromLocalInput, toDateInput, toLocalInput, whenLabel } from "@/lib/localtime";
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
  /** Which of the six forms (TEC-136): Fun and Training both save `exercise`. */
  form: FormKind;
  /** Health's tab on a new entry (TEC-199): Vet visit unless a Done or a Medication opens it on another. */
  healthType?: HealthType;
  /** A tapped since-last pill or the Treats button (TEC-181, TEC-186): a new entry opens on its pick. Ignored when correcting. */
  quick?: QuickLog;
  /** Set when correcting an entry; the form opens on its values. */
  event?: JournalEvent;
  /**
   * A Done on an upcoming item (TEC-192, TEC-199): the form opens on the item's day and time (once they have
   * come), its reason, medication and dose, and its words as the note. New entry only.
   */
  done?: DonePrefill;
  /**
   * An open upcoming item being edited (TEC-203): the form opens on its future When and its words, and Save updates
   * the item in place. A done or cancelled item is never opened.
   */
  plan?: Upcoming;
  /** A training, fun or potty being corrected: the treats already logged with it (`treatsWith`), shown, not changed. */
  sessionTreats?: JournalEvent[];
  people: Person[];
  /** Friends' dogs from `lando.dogs`, by name. */
  dogs: Dog[];
  /** Other dogs' "Add dog…": adds one to `lando.dogs` (or finds it) and hands it back. */
  onAddDog: (name: string) => Promise<{ dog: Dog | null; error: string | null }>;
  /** Foods added in the app (`lando.foods`, TEC-191), retired ones too: the picklist is these plus the code catalogue. */
  foods: AddedFood[];
  /** The What pick's "Add a food…": saves one to `lando.foods` and hands it back. */
  onAddFood: (food: { type: ListType; name: string; unit: FoodUnit; kcalPer: number | null }) => Promise<{ food: AddedFood | null; error: string | null }>;
  /** Medications added in the app (`lando.medications`, TEC-199), retired ones too. */
  medications: Medication[];
  /** The Medication pick's "Add a medication…": saves one to `lando.medications` and hands it back. */
  onAddMedication: (m: { name: string; unit: MedUnit }) => Promise<{ medication: Medication | null; error: string | null }>;
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
   * A new entry: handed off at once, never awaited (RULES.md, Never 5). `then`
   * are the follow-ups (a treat count's entry, a vet visit's weight), saved once the entry itself is.
   */
  onLog: (body: LogBody, then?: LogBody[]) => void;
  /** A correction or a delete: awaited, and its error shown here. `then` are saved once it succeeds. */
  onChange: (body: Record<string, unknown>, then?: LogBody[]) => Promise<{ error: string | null }>;
  /** A future When (TEC-199): saves an upcoming item instead of an entry. Awaited, and its error shown here. */
  onUpcoming: (item: UpcomingInput, id?: string) => Promise<{ error: string | null }>;
  /**
   * Fun's Pee and Poop buttons (TEC-186): a potty entry handed off at once through the same pending
   * path as any new entry, and the sheet stays open. Never awaited (RULES.md, Never 5).
   */
  onPotty: (body: LogBody) => void;
  /** The state of every entry not yet saved, by id; an id not in it has saved. */
  unsaved: Record<string, "saving" | "failed">;
  /** Retry an unsaved entry by id. */
  onRetry: (id: string) => void;
};

/* ── Small parts ─────────────────────────────────────────────────────────── */

export function Field({ label, htmlFor, children, className = "" }: { label: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
  const lbl = "text-[11px] uppercase tracking-[0.06em] text-ink-soft";
  return (
    <div className={`grid min-w-0 content-start gap-0.5 ${className}`}>
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

/**
 * One choice of a few, as chips (TEC-199: sized to their content with narrow padding, wrapping rather than
 * stretching). Real radios underneath, so arrows and screen readers work. Each label is the 44px hit area; the
 * chip is its inner span.
 */
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
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-x-1">
      {options.map(([v, text]) => (
        <label key={v} className="relative flex min-h-[44px] items-center">
          <input
            type="radio"
            name={name}
            value={v}
            checked={value === v}
            onChange={() => onChange(v)}
            className="peer absolute opacity-0"
          />
          <span className="block cursor-pointer whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-1 text-[15px] peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-ink peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pinstripe">
            {text}
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * A box of a form (TEC-199): Box 1 is When and Logging as, Box 2 the entry, Box 3 the secondary things. The
 * `data-section` marks them in order for the tests and for anyone reading the form.
 */
export function Box({ section, label, children }: { section: string; label: string; children: React.ReactNode }) {
  return (
    <section data-section={section} aria-label={label} className="grid gap-1.5 rounded-xl border border-line bg-paper p-2">
      {children}
    </section>
  );
}

/** The What pick's last option: opens the add-a-food form, never a value. */
const FOOD_ADD = "__add";
/** The Medication pick's last option: opens the add-a-medication form, never a value. */
const MED_ADD = "__add_med";

/**
 * A field box: narrow padding, 44px tall. It carries no width (TEC-202): Tailwind writes `w-full` after
 * `w-[64px]` and `w-auto`, so a width here would beat every narrow field. Each field names its own width:
 * `inputFull` where it fills its column, `w-[..]` or the content's own width elsewhere.
 */
export const input =
  "min-w-0 min-h-[44px] rounded-[10px] border border-line bg-surface px-2 py-1.5 text-[15px] outline-none focus:border-accent";

export const inputFull = `${input} w-full`;

const WHERE_OPTS = [
  ["outside", "Outside"],
  ["inside", "Inside"],
] as const;

/* ── The form ────────────────────────────────────────────────────────────── */

/** The treats already logged with an entry being corrected: shown, not changed. */
function LoggedTreats({ treats }: { treats: JournalEvent[] }) {
  return (
    <ul aria-label="Treats with this entry" className="flex flex-col gap-1 text-[13px]">
      {treats.map((t) => (
        <li key={t.id} className="text-ink-soft">
          Logged: {describe(t).detail}
        </li>
      ))}
    </ul>
  );
}

export default function LogForm({
  form,
  healthType: startHealthType,
  quick,
  event,
  done,
  plan,
  sessionTreats = [],
  people,
  dogs,
  onAddDog,
  foods,
  onAddFood,
  medications,
  onAddMedication,
  phonePerson,
  events,
  photoUrls,
  onPhotoUrl,
  remembered,
  weightUnit,
  onLog,
  onChange,
  onUpcoming,
  onPotty,
  unsaved,
  onRetry,
}: Props) {
  const kind: Exclude<LogKind, "note"> = kindOfForm(form);
  const editing = !!event;
  const openedAt = useRef(new Date().toISOString());
  // A weight is a day, not a moment: its When picks a date, stored at local noon.
  const dateOnly = kind === "weight";
  // Every form takes photos and files (TEC-137, TEC-139, TEC-142; Food, Weight and any file type TEC-203).

  // Common. A Done opens on the item's day and time once they have come; before that it is "now". An edit of an
  // upcoming item opens on its own day and time, past or not: it is a plan, and overdue is a state, not an error.
  const prefill = !event ? (done ?? (plan ? donePrefill(plan, medications) : undefined)) : undefined;
  const prefillWhen = prefill ? (plan ? `${prefill.day}T${prefill.time}` : doneWhen(prefill, new Date())) : null;
  const [when, setWhen] = useState(prefillWhen ?? toLocalInput(event?.at ?? openedAt.current));
  const [day, setDay] = useState(prefillWhen ? prefillWhen.slice(0, 10) : toDateInput(event?.at ?? openedAt.current));
  const [whenTouched, setWhenTouched] = useState(!!prefillWhen);
  const [personId, setPersonId] = useState(event ? event.person_id ?? "" : phonePerson ?? "");
  const [note, setNote] = useState(event?.note ?? prefill?.note ?? "");
  // A repeat, for a future When only (TEC-199): every N weeks, months or years.
  const [repeatOn, setRepeatOn] = useState(!!plan?.repeat_every);
  const [repeatEvery, setRepeatEvery] = useState(String(plan?.repeat_every ?? 1));
  const [repeatUnit, setRepeatUnit] = useState<RepeatUnit>(plan?.repeat_unit ?? "week");

  // Potty: nothing is preselected for What (TEC-199) unless a Pee or Poop pill opened it; a save without one is refused.
  const p = event?.kind === "potty" ? asPotty(event) : null;
  const quickPotty = !event && quick?.form === "potty" ? quick : null;
  const quickFood = !event && quick?.form === "food" ? quick : null;
  const [what, setWhat] = useState<PottyWhat | "">(p?.what ?? quickPotty?.what ?? "");
  const [where, setWhere] = useState(p?.where ?? (event?.kind === "exercise" ? asExercise(event).where : "outside"));
  // Leashed by default. An outside entry from before the pick existed opens
  // with nothing picked, so a correction never invents one.
  const [leash, setLeash] = useState<Leash | "">(p ? (p.leash ?? (p.where === "inside" ? "leashed" : "")) : "leashed");
  // Inside only, nothing picked by default: a new or old inside entry never
  // gets a spot unless one is tapped.
  const [spot, setSpot] = useState<Spot | "">(p?.spot ?? "");
  // Time outside (TEC-176, range chips since TEC-193): optional, outside only, never remembered. A chip saves
  // its upper bound. Nothing on a new entry; a correction opens holding the entry's own minutes, which stay
  // unless a chip is tapped (an older value such as 10 shows no chip picked and saves as it was).
  const [outMin, setOutMin] = useState<number | null>(p?.minutes ?? null);

  // Food
  const f = event?.kind === "food" ? asFood(event) : null;
  // The Treats button opens Food on a treat (TEC-186); the meal/treat choice stays in the form.
  const firstFoodType: FoodType = f?.type ?? (quickFood?.type === "treat" ? "treat" : "meal");
  const [foodType, setFoodType] = useState<FoodType>(firstFoodType);
  const [itemId, setItemId] = useState(f?.item_id ?? quickFood?.itemId ?? defaultFood(firstFoodType, remembered, foods));
  // An amount from the ⅛ scroller (TEC-136). The amount it opened on stays on
  // the list even when it is not an eighth (an older 1/3), so an untouched
  // correction keeps it.
  const [amount, setAmount] = useState<number | null>(
    f ? f.amount : quickFood?.itemId ? quickFood.amount : defaultAmount(firstFoodType, remembered)
  );
  const [openedAmount] = useState(amount);
  // "Add a food…" (TEC-191): the inline form under What. It never becomes the pick; the new food does.
  const [addingFood, setAddingFood] = useState(false);
  const [foodName, setFoodName] = useState("");
  const [foodUnit, setFoodUnit] = useState<FoodUnit>(firstFoodType === "treat" ? "piece" : "cup");
  const [foodKcal, setFoodKcal] = useState("");
  const [foodError, setFoodError] = useState<string | null>(null);
  const [foodBusy, setFoodBusy] = useState(false);

  // Exercise: Fun is a walk or playtime; Training is always training (TEC-136).
  const x = event?.kind === "exercise" ? asExercise(event) : null;
  const [exType, setExType] = useState<ExerciseType>(form === "training" ? "training" : x?.type ?? "walk");
  // Fun's Pee and Poop buttons (TEC-186): what this form has logged so far. Each is its own potty entry.
  const [tapped, setTapped] = useState<{ id: string; what: "pee" | "poop"; at: string; detail: string }[]>([]);
  // The treat count on Potty, Training and Fun (TEC-199): opens on 0, which logs nothing. A count above 0 is
  // saved as its own Misc treat entry once this one is. Its id is fixed, so a retry is the same row.
  const [treatQty, setTreatQty] = useState(0);
  const treatId = useRef(crypto.randomUUID());
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
  const [commands, setCommands] = useState<CommandId[]>(x?.commands ?? []);

  // Weight
  const w = event?.kind === "weight" ? asWeight(event) : null;
  const [value, setValue] = useState(w ? String(w.value) : "");
  const [unit, setUnit] = useState<Unit>(w?.unit ?? remembered.unit ?? weightUnit);

  // Health (TEC-137): a vet visit, a medical issue or a medication dose, photos on all.
  const h = event?.kind === "health" ? asHealth(event) : null;
  // A vet visit's optional Weight (TEC-151). It opens empty, in this phone's last
  // unit; a correction opens on the weight already saved with the visit, and
  // changing it corrects that entry rather than adding a second.
  const [linked] = useState(() => (event && h?.type === "vet" ? linkedWeight(events, event.id) : null));
  const [visitValue, setVisitValue] = useState(linked ? String(asWeight(linked).value) : "");
  const [visitUnit, setVisitUnit] = useState<Unit>(linked ? asWeight(linked).unit : remembered.unit ?? weightUnit);
  const [healthType, setHealthType] = useState<HealthType>(h?.type ?? startHealthType ?? "vet");
  // Related issue (TEC-142), on Potty, a vet visit and a medication dose: the id of a medical
  // issue, or none. A correction opens on the stored link and keeps it unless
  // it is changed; `issueChoices` adds it as an option when the list would not.
  const [firstIssue] = useState(p?.issue ?? h?.issue ?? "");
  const [issue, setIssue] = useState(firstIssue);
  // The "Medical issue" checkbox (TEC-161) gates the select: a correction with a
  // stored link opens ticked on it; unticked, no link is saved (the pick is kept, so
  // ticking again brings it back).
  const [hasIssue, setHasIssue] = useState(firstIssue !== "");
  const issueOptions = issueChoices(events, firstIssue || null);
  // One high-level pick (TEC-139). An entry from before it, with several or
  // retired reasons, opens on them as a kept option and saves them unchanged
  // until another pick is made.
  const [{ pick: firstReason, kept: keptReasons }] = useState(() => healthPickFor(h));
  const [reason, setReason] = useState(firstReason || prefill?.reason || "");
  // A medication dose (TEC-199): which medication, how much, in what unit, and how it was given.
  const [medId, setMedId] = useState(h?.med_id ?? prefill?.medId ?? "");
  const [dose, setDose] = useState(h?.dose !== undefined ? String(h.dose) : prefill?.dose ?? "");
  const [medUnit, setMedUnit] = useState<MedUnit>(
    h?.unit ?? ((MED_UNITS as readonly string[]).includes(prefill?.unit ?? "") ? (prefill!.unit as MedUnit) : findMedication(medications, h?.med_id ?? prefill?.medId ?? "")?.unit ?? "mg")
  );
  const [route, setRoute] = useState<MedRoute>(h?.route ?? "mouth");
  // "Add a medication…": the inline form under the pick. It never becomes the pick; the new medication does.
  const [addingMed, setAddingMed] = useState(false);
  const [medName, setMedName] = useState("");
  const [newMedUnit, setNewMedUnit] = useState<MedUnit>("mg");
  const [medError, setMedError] = useState<string | null>(null);
  const [medBusy, setMedBusy] = useState(false);
  // Photos (TEC-137, and Fun and Training since TEC-139). A correction opens
  // with the photos the entry has and keeps whatever is not removed.
  // A Done or an edit of an upcoming item opens with the item's own (TEC-203), so a Done's entry carries them.
  const photos = usePhotos(
    event ? eventPhotos(event) : prefill?.photos ?? [],
    event ? eventNames(event) : prefill?.names ?? {},
    photoUrls,
    onPhotoUrl
  );
  const attachments = photos.paths.length ? { photos: photos.paths, ...(Object.keys(photos.names).length ? { names: photos.names } : {}) } : {};

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

  // A When after now is a plan (TEC-199): the form says so and saves an upcoming item, with a Repeat. A saved
  // entry cannot be moved there. The clock is read each render, so the line is right when Save is pressed.
  const nowDate = new Date();
  const futureWhen =
    whenTouched &&
    (dateOnly
      ? isFutureDay(day, toDateInput(nowDate.toISOString()))
      : isFutureWhen(fromLocalInput(when) ? new Date(fromLocalInput(when)!) : null, nowDate));
  const future = futureWhen && !editing;
  // Saves an upcoming item: a future When on a new entry, or an open item being edited.
  const planning = !!plan || future;

  function pickFoodType(t: FoodType) {
    setFoodType(t);
    setItemId(defaultFood(t, remembered, foods));
    setAddingFood(false);
    setFoodError(null);
    setFoodUnit(t === "treat" ? "piece" : "cup");
    setAmount(defaultAmount(t, remembered));
  }

  /** Fun's Pee or Poop: one tap saves a potty entry now, no confirm. Where comes from `funPotty`. */
  function tapPotty(what: "pee" | "poop") {
    const raw = funPotty({ type: exType, where }, what);
    if (!raw) return;
    const at = new Date().toISOString();
    const body: LogBody = {
      id: crypto.randomUUID(),
      kind: "potty",
      at,
      person_id: personId || null,
      details: parseDetails("potty", raw),
      note: null,
    };
    setTapped((t) => [...t, { id: body.id, what, at, detail: describe(body).detail }]);
    onPotty(body);
  }

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

  /** Add a food: checked here as the server will, saved, then picked. It is logged only when the form is saved. */
  async function addFood(e: { preventDefault(): void }) {
    e.preventDefault();
    setFoodError(null);
    const kcal = foodKcal.trim().replace(",", ".");
    let checked;
    try {
      checked = parseNewFood({ type: foodType, name: foodName, unit: foodUnit, kcalPer: kcal === "" ? null : Number(kcal) }, foods);
    } catch (err) {
      setFoodError(err instanceof InvalidEvent ? err.message : "check the food");
      return;
    }
    setFoodBusy(true);
    const { food, error } = await onAddFood(checked);
    setFoodBusy(false);
    if (!food) {
      setFoodError(error ?? "couldn't add");
      return;
    }
    setItemId(food.id);
    setAddingFood(false);
    setFoodName("");
    setFoodKcal("");
  }

  /** Add a medication: checked here as the server will, saved, then picked. A dose is logged only when the form is saved. */
  async function addMedication(e: { preventDefault(): void }) {
    e.preventDefault();
    setMedError(null);
    let checked;
    try {
      checked = parseNewMedication({ name: medName, unit: newMedUnit }, medications);
    } catch (err) {
      setMedError(err instanceof InvalidEvent ? err.message : "check the medication");
      return;
    }
    setMedBusy(true);
    const { medication, error } = await onAddMedication(checked);
    setMedBusy(false);
    if (!medication) {
      setMedError(error ?? "couldn't add");
      return;
    }
    setMedId(medication.id);
    setMedUnit(medication.unit);
    setAddingMed(false);
    setMedName("");
  }

  const item = findFood(foodType, itemId, foods);
  const amountUnit = item?.unit ? unitLabel(item.unit, amount ?? 2) : null;
  const pickedMed = findMedication(medications, medId);

  function rawDetails(): Record<string, unknown> {
    switch (kind) {
      case "potty":
        return {
          what,
          where,
          ...(where === "outside" && leash ? { leash } : {}),
          ...(where === "inside" && spot ? { spot } : {}),
          ...(where === "outside" && outMin !== null ? { minutes: outMin } : {}),
          ...(hasIssue && issue ? { issue } : {}),
          ...attachments,
        };
      case "food":
        return { type: foodType, item_id: itemId, amount, ...attachments };
      case "exercise":
        return {
          type: exType,
          where,
          minutes: Number(minutes),
          // The treats a session counts are its treat entries (as Training always did): 1 when a count was
          // added now, on top of any already logged with it.
          treats: (x?.treats ?? 0) + (treatQty > 0 ? 1 : 0),
          ...(exType === "training" ? { commands } : {}),
          ...dogsFromPick(dogPick, keptDogs),
          ...attachments,
        };
      case "weight":
        // A weight saved from a vet visit keeps its link when corrected here (TEC-151).
        return { value: Number(value.replace(",", ".")), unit, ...(w?.visit ? { visit: w.visit } : {}), ...attachments };
      case "health":
        if (healthType === "medication") {
          return {
            type: "medication",
            med_id: medId,
            dose: Number(dose.replace(",", ".")),
            unit: medUnit,
            route,
            ...(hasIssue && issue ? { issue } : {}),
            ...attachments,
          };
        }
        return {
          type: healthType,
          reasons: healthReasonsFromPick(reason === HEALTH_KEPT && h?.type !== healthType ? "" : reason, keptReasons),
          ...(healthType === "vet" && hasIssue && issue ? { issue } : {}),
          ...attachments,
        };
    }
  }

  /** A future When: the form's words become an upcoming item, saved and awaited (its error stays here). */
  async function submitFuture() {
    let item: UpcomingInput;
    try {
      const every = repeatOn ? Number(repeatEvery) : null;
      item = futureItem({
        form,
        healthType,
        day: dateOnly ? day : when.slice(0, 10),
        time: dateOnly ? null : when.slice(11, 16),
        note,
        repeatEvery: every,
        repeatUnit: repeatOn ? repeatUnit : null,
        reason: reason === HEALTH_KEPT ? "" : reason,
        med: healthType === "medication" ? { name: pickedMed?.name ?? "", dose: Number(dose.replace(",", ".")) || null, unit: medUnit } : null,
        photos: photos.paths,
        names: Object.keys(photos.names).length ? photos.names : undefined,
      });
    } catch (err) {
      setError(err instanceof InvalidEvent ? err.message : "check the form");
      return;
    }
    setBusy(true);
    const { error } = await onUpcoming(item, plan?.id);
    setBusy(false);
    if (error) setError(error);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (futureWhen && editing) {
      setError("A saved entry can't move to the future — delete it and log a new one for then.");
      return;
    }
    // Never saved around an attachment: it is uploaded, or the person removes it.
    if (photos.working || photos.failed) {
      setError(photos.failed ? "An attachment didn't upload — retry it, or remove it." : "An attachment is still uploading.");
      return;
    }
    if (planning) {
      await submitFuture();
      return;
    }
    // Potty opens with nothing picked and will not save without a What (TEC-199).
    if (kind === "potty" && !what) {
      setError("Pick what happened — pee, poop, both or no potty.");
      return;
    }
    // The pick is the headline; the note is the story, and it is required for a vet visit or an issue (TEC-139).
    if (kind === "health" && healthType !== "medication" && !note.trim()) {
      setError("Say what happened — the note is required.");
      return;
    }
    if (kind === "health" && healthType === "medication") {
      if (!medId) {
        setError("Pick the medication.");
        return;
      }
      if (!dose.trim()) {
        setError("Say how much was given.");
        return;
      }
    }
    // A treat's amount is a whole number, 1 or more (TEC-188). A correction that never touched it
    // keeps whatever it opened on.
    if (kind === "food" && foodType === "treat") {
      const bad = treatQtyError(amount, f ? f.amount : undefined);
      if (bad) {
        setError(bad);
        return;
      }
    }
    let details: Details;
    try {
      // The same check the server makes, so a mistake is caught before the sheet closes.
      details = parseDetails(kind, rawDetails(), foods, medications);
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
    // The treat count on Potty, Training and Fun: one Misc treat entry at this entry's time and person, amount
    // the count, saved after it, and none at 0 (TEC-199).
    let then: LogBody[] = [];
    try {
      if (kind === "potty" || kind === "exercise") {
        then = inlineTreatEntries({ id: treatId.current, item_id: MISC_ID, qty: treatQty }, at, body.person_id, foods);
      }
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
  const photoBlock = photos.working || photos.failed;

  // The medical issue link, on Potty, a vet visit and a medication dose (TEC-142, TEC-199): a checkbox, and
  // behind it None and the recent live medical issues, newest first, by date and pick.
  const issueCheck = (label: string) => (
    <label className="flex min-h-[44px] items-center gap-2">
      <input type="checkbox" checked={hasIssue} onChange={(e) => setHasIssue(e.target.checked)} className="h-5 w-5 accent-accent" />
      <span>{label}</span>
    </label>
  );
  const issueSelect = hasIssue && (
    <Field label="Related issue" htmlFor="f-issue">
      <select id="f-issue" value={issue} onChange={(e) => setIssue(e.target.value)} className={inputFull}>
        <option value="">None</option>
        {issueOptions.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );

  // The Other dogs pick, shared by Fun and Training. Its "Add dog…" swaps it for a name box.
  const dogsField = (
    <Field label="Other dogs" htmlFor="f-dogs">
      {/* One pick (TEC-129): every dog by name, then Multiple, then Add dog. Add dog never becomes the
          value: it opens the name box and the pick stays where it was until a dog is added. */}
      <select
        id="f-dogs"
        value={dogPick}
        onChange={(e) => {
          if (e.target.value === DOGS_ADD) {
            setAddingDog(true);
            setDogError(null);
          } else setDogPick(e.target.value);
        }}
        className={inputFull}
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
    </Field>
  );
  const addDogRow = addingDog && (
    /* Not a nested <form> (HTML has none): Enter here adds the dog rather than saving the session. */
    <div className="flex min-w-0 items-center gap-2">
      <input
        id="f-dog-name"
        aria-label="Dog's name"
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
      <button type="button" onClick={(e) => void addDog(e)} disabled={dogBusy} className="min-h-[44px] rounded-[10px] bg-accent px-3 font-medium text-accent-ink disabled:opacity-60">
        {dogBusy ? "Adding…" : "Add"}
      </button>
      <button
        type="button"
        onClick={() => {
          setAddingDog(false);
          setDogError(null);
        }}
        className="min-h-[44px] px-1 text-ink-soft"
      >
        Cancel
      </button>
    </div>
  );

  const treatCount = <TreatCount value={treatQty} onChange={setTreatQty} />;

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      {/* Box 1: When and Logging as, on one line (TEC-199). When is as wide as its label ("Now", "Tue 8:00 AM"),
          not half the row, and both boxes are the same 44px tall (TEC-202). */}
      <Box section="when" label="When and who">
        <div className="flex items-start gap-2">
          <Field label="When" htmlFor="f-when">
            {/* The native control is wider than half a phone and pushed into
                Logging as, so a short label shows instead. The real input sits over
                it, transparent: a tap opens the phone's own picker, and focus,
                screen readers and keyboard editing still reach the input. */}
            <div className="relative h-[44px] min-w-0 rounded-[10px] border border-line bg-surface focus-within:border-accent">
              <span aria-hidden="true" className="block truncate px-2 text-[15px] leading-[42px] tabular-nums">
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
          <Field label="Logging as" htmlFor="f-who">
            <select
              id="f-who"
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className={`${input} h-[44px]`}
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
        {(futureWhen || plan) && (
          <div className="grid gap-1">
            <p role="status" className="text-[13px] font-semibold text-ink">
              {editing ? "A saved entry can't move to the future." : plan && !futureWhen ? "Upcoming: Save updates it" : FUTURE_NOTICE}
            </p>
            {planning && (
              <div className="flex flex-wrap items-center gap-x-2">
                <label className="flex min-h-[44px] items-center gap-2">
                  <input type="checkbox" checked={repeatOn} onChange={(e) => setRepeatOn(e.target.checked)} className="h-5 w-5 accent-accent" />
                  <span>Repeat</span>
                </label>
                {repeatOn && (
                  <>
                    <span className="text-ink-soft">every</span>
                    <input
                      aria-label="Repeat every"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={REPEAT_MAX}
                      value={repeatEvery}
                      onChange={(e) => setRepeatEvery(e.target.value)}
                      className={`${input} w-[64px]`}
                    />
                    <select aria-label="Repeat unit" value={repeatUnit} onChange={(e) => setRepeatUnit(e.target.value as RepeatUnit)} className={`${input} w-auto`}>
                      {REPEAT_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {Number(repeatEvery) === 1 ? u : `${u}s`}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Box>

      {/* Box 2: the entry. */}
      <Box section="entry" label="The entry">
        {kind === "potty" && (
          <>
            <Field label="What">
              <Seg name="what" label="What" value={what} onChange={setWhat} options={POTTY_WHAT.map((v) => [v, POTTY_WHAT_LABELS[v]] as const)} />
            </Field>
            {/* Where and Leash (or Spot) on one line. */}
            <div className="flex flex-wrap items-start gap-x-4">
              <Field label="Where">
                <Seg name="where" label="Where" value={where} onChange={setWhere} options={WHERE_OPTS} />
              </Field>
              {where === "outside" && (
                <Field label="Leash">
                  <Seg name="leash" label="Leash" value={leash} onChange={setLeash} options={leashOptions(leash)} />
                </Field>
              )}
              {where === "inside" && (
                <Field label="Spot">
                  <Seg name="spot" label="Spot" value={spot} onChange={setSpot} options={spotOptions(spot)} />
                </Field>
              )}
            </div>
            {where === "outside" && (
              <Field label="Time outside">
                {/* Range chips only (TEC-186, TEC-193): each saves its upper bound ("≤5" saves 5, "5–15" saves 15). */}
                <div role="group" aria-label="Time outside, minutes" className="flex flex-wrap gap-x-1">
                  {OUT_MINUTES_CHIPS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={outMinutesChip(outMin) === m}
                      aria-label={outMinutesAria(m)}
                      onClick={() => setOutMin(outMinutesChip(outMin) === m ? null : m)}
                      className="group flex min-h-[44px] items-center whitespace-nowrap focus-visible:outline-none"
                    >
                      <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[15px] group-aria-pressed:border-accent group-aria-pressed:bg-accent group-aria-pressed:text-accent-ink group-focus-visible:outline group-focus-visible:outline-[3px] group-focus-visible:outline-offset-2 group-focus-visible:outline-pinstripe">
                        {outMinutesLabel(m)}
                      </span>
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </>
        )}

        {kind === "food" && (
          <>
            <Field label="Type">
              <Seg name="type" label="Type" value={foodType} onChange={pickFoodType} options={[["meal", "Meal"], ["snuffle", "Snuffle mat"], ["treat", "Treat"]] as const} />
            </Field>
            {/* What and a half-size Amount scroller on one line. */}
            <div className="flex items-start gap-2">
              <Field label="What" htmlFor="f-item" className="flex-1">
                <select
                  id="f-item"
                  value={itemId}
                  onChange={(e) => {
                    // Add a food… never becomes the value: it opens the form and the pick stays put.
                    if (e.target.value === FOOD_ADD) {
                      setAddingFood(true);
                      setFoodError(null);
                    } else setItemId(e.target.value);
                  }}
                  className={inputFull}
                >
                  {/* A retired item stays selectable on the entry that already has it. */}
                  {(item && !picklist(foodType, foods).includes(item) ? [item, ...picklist(foodType, foods)] : picklist(foodType, foods)).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                  <option value={FOOD_ADD}>Add a food…</option>
                </select>
              </Field>
              <Field label="Amount" htmlFor="f-amount" className="shrink-0">
                {/* Just the box, and the unit as a small word beside it (TEC-202), so the column is no wider than the box. */}
                <div className="flex items-start gap-1">
                {foodType === "treat" ? (
                  <TreatQty id="f-amount" label={amountUnit ? `Amount in ${amountUnit}` : "Amount"} value={amount} onChange={setAmount} />
                ) : (
                  <AmountScroller
                    id="f-amount"
                    label={amountUnit ? `Amount in ${amountUnit}` : "Amount"}
                    options={amountOptions(openedAmount, defaultAmount("meal", remembered))}
                    value={amount}
                    onChange={setAmount}
                  />
                )}
                  {amountUnit && <span className="pt-2.5 text-[13px] text-ink-soft">{amountUnit}</span>}
                </div>
              </Field>
            </div>
            {addingFood && (
              /* Not a nested <form> (HTML has none): Enter in the name box adds the food rather than saving the entry. */
              <div className="grid gap-1.5 rounded-xl border border-line bg-surface p-2">
                <span className="text-[11px] uppercase tracking-[0.06em] text-ink-soft">Add a {foodType === "treat" ? "treat" : "meal"} food</span>
                <Field label="Name" htmlFor="f-food-name">
                  <input
                    id="f-food-name"
                    autoFocus
                    value={foodName}
                    onChange={(e) => setFoodName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void addFood(e);
                    }}
                    maxLength={60}
                    placeholder="Food name"
                    className={inputFull}
                  />
                </Field>
                <div className="flex items-start gap-2">
                  <Field label="Unit" htmlFor="f-food-unit">
                    <select id="f-food-unit" value={foodUnit} onChange={(e) => setFoodUnit(e.target.value as FoodUnit)} className={inputFull}>
                      {FOOD_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Calories per unit (optional)" htmlFor="f-food-kcal" className="flex-1">
                    <input
                      id="f-food-kcal"
                      inputMode="decimal"
                      value={foodKcal}
                      onChange={(e) => setFoodKcal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void addFood(e);
                      }}
                      placeholder="Off the label"
                      className={inputFull}
                    />
                  </Field>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={(e) => void addFood(e)} disabled={foodBusy} className="min-h-[44px] rounded-[10px] bg-accent px-3 font-medium text-accent-ink disabled:opacity-60">
                    {foodBusy ? "Adding…" : "Add"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingFood(false);
                      setFoodError(null);
                    }}
                    className="min-h-[44px] px-1 text-ink-soft"
                  >
                    Cancel
                  </button>
                </div>
                {foodError && <p className="text-[13px] font-semibold text-danger">{foodError}</p>}
              </div>
            )}
            {item?.unit === null && <p className="text-[13px] text-ink-soft">Misc: say what it was in the note.</p>}
          </>
        )}

        {kind === "exercise" && (
          <>
            {/* Fun picks walk or playtime; Training has no Type (TEC-136). */}
            {form === "fun" && (
              <Field label="Type">
                <Seg name="type" label="Type" value={exType} onChange={setExType} options={FUN_TYPES.map((t) => [t, EXERCISE_LABELS[t]] as const)} />
              </Field>
            )}
            {/* Where and Time on one line (Fun calls it Length). */}
            <div className="flex flex-wrap items-start gap-x-4">
              <Field label="Where">
                <Seg name="where" label="Where" value={where} onChange={setWhere} options={WHERE_OPTS} />
              </Field>
              <Field label={form === "training" ? "Time (min)" : "Length (min)"} htmlFor="f-mins">
                <input id="f-mins" type="number" inputMode="numeric" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={`${input} w-[76px]`} />
              </Field>
            </div>
            {/* Commands and Other dogs on one line; Fun has Other dogs alone. */}
            {addDogRow || (
              <div className={`grid items-start gap-2 ${exType === "training" ? "grid-cols-2" : "grid-cols-1"}`}>
                {exType === "training" && (
                  <Field label="Commands practised" htmlFor="f-commands">
                    {/* A picklist, not chips (TEC-193): a native multi-select over the fixed list, which a phone
                        shows as a checklist. The picks are stored as before, in the list's order. */}
                    <select
                      id="f-commands"
                      multiple
                      value={commands}
                      onChange={(e) => setCommands(Array.from(e.target.selectedOptions, (o) => o.value as CommandId))}
                      className={inputFull}
                    >
                      {COMMANDS.map(([id, text]) => (
                        <option key={id} value={id}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {dogsField}
              </div>
            )}
            {dogError && <p className="text-[13px] font-semibold text-danger">{dogError}</p>}
            {exType === "training" && commands.length > 0 && (
              <p aria-live="polite" className="text-[13px] text-ink-soft">
                Picked: {COMMANDS.filter(([id]) => commands.includes(id)).map(([, text]) => text).join(", ")}
              </p>
            )}
          </>
        )}

        {kind === "weight" && (
          <div className="flex flex-wrap items-start gap-x-4">
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
                className={`${input} w-[96px]`}
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
              <Seg name="health-type" label="Type" value={healthType} onChange={pickHealthType} options={HEALTH_TYPES.map((t) => [t, HEALTH_LABELS[t]] as const)} />
            </Field>
            {healthType !== "medication" && (
              /* One plain select, like Other dogs (TEC-139); the detail goes in the note. */
              <Field label={healthType === "vet" ? "Why" : "What"} htmlFor="f-reason">
                <select id="f-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputFull}>
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
            )}
            {healthType === "vet" && (
              <div className="flex flex-wrap items-start gap-x-4">
                <Field label="Weight (optional)" htmlFor="f-visit-weight">
                  <input
                    id="f-visit-weight"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={visitValue}
                    onChange={(e) => setVisitValue(e.target.value)}
                    placeholder="7.0"
                    className={`${input} w-[96px]`}
                  />
                </Field>
                <Field label="Unit">
                  <Seg name="visit-unit" label="Unit" value={visitUnit} onChange={setVisitUnit} options={UNITS.map((u) => [u, u] as const)} />
                </Field>
              </div>
            )}
            {healthType === "medication" && (
              <>
                {/* Medication, Dose and Unit on one line. */}
                {addingMed ? (
                  /* Not a nested <form> (HTML has none): Enter in the name box adds the medication rather than saving the dose. */
                  <div className="grid gap-1.5 rounded-xl border border-line bg-surface p-2">
                    <span className="text-[11px] uppercase tracking-[0.06em] text-ink-soft">Add a medication</span>
                    <div className="flex items-start gap-2">
                      <Field label="Name" htmlFor="f-med-name" className="flex-1">
                        <input
                          id="f-med-name"
                          autoFocus
                          value={medName}
                          onChange={(e) => setMedName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void addMedication(e);
                          }}
                          maxLength={60}
                          placeholder="Medication name"
                          className={inputFull}
                        />
                      </Field>
                      <Field label="Unit" htmlFor="f-med-new-unit">
                        <select id="f-med-new-unit" value={newMedUnit} onChange={(e) => setNewMedUnit(e.target.value as MedUnit)} className={inputFull}>
                          {MED_UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={(e) => void addMedication(e)} disabled={medBusy} className="min-h-[44px] rounded-[10px] bg-accent px-3 font-medium text-accent-ink disabled:opacity-60">
                        {medBusy ? "Adding…" : "Add"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingMed(false);
                          setMedError(null);
                        }}
                        className="min-h-[44px] px-1 text-ink-soft"
                      >
                        Cancel
                      </button>
                    </div>
                    {medError && <p className="text-[13px] font-semibold text-danger">{medError}</p>}
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <Field label="Medication" htmlFor="f-med" className="flex-1">
                      <select
                        id="f-med"
                        value={medId}
                        onChange={(e) => {
                          // Add a medication… never becomes the value: it opens the form and the pick stays put.
                          if (e.target.value === MED_ADD) {
                            setAddingMed(true);
                            setMedError(null);
                            return;
                          }
                          setMedId(e.target.value);
                          const m = findMedication(medications, e.target.value);
                          if (m) setMedUnit(m.unit);
                        }}
                        className={inputFull}
                      >
                        <option value="">Pick one…</option>
                        {/* A retired medication stays selectable on the dose that already has it. */}
                        {(pickedMed && !medPicklist(medications).includes(pickedMed) ? [pickedMed, ...medPicklist(medications)] : medPicklist(medications)).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                        <option value={MED_ADD}>Add a medication…</option>
                      </select>
                    </Field>
                    <Field label="Dose" htmlFor="f-dose" className="shrink-0">
                      <input id="f-dose" type="text" inputMode="decimal" autoComplete="off" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="5" className={`${input} w-[64px]`} />
                    </Field>
                    <Field label="Unit" htmlFor="f-med-unit" className="shrink-0">
                      <select id="f-med-unit" value={medUnit} onChange={(e) => setMedUnit(e.target.value as MedUnit)} className={`${input} w-auto`}>
                        {MED_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}
                <Field label="Given">
                  <Seg name="route" label="Given" value={route} onChange={setRoute} options={MED_ROUTES} />
                </Field>
                {issueCheck("For a medical issue")}
                {issueSelect}
              </>
            )}
          </>
        )}
      </Box>

      {/* Box 3: the secondary things (TEC-199). Potty: the treats count then the medical issue, on one line.
          Training and Fun: the treats count. A vet visit: the medical issue. Not on a future entry, which
          keeps no treats or issue link. */}
      {!planning && (kind === "potty" || kind === "exercise" || (kind === "health" && healthType === "vet")) && (
        <Box section="secondary" label="Treats and issue">
          <div className="flex flex-wrap items-center gap-x-4">
            {(kind === "potty" || kind === "exercise") && treatCount}
            {(kind === "potty" || (kind === "health" && healthType === "vet")) && issueCheck("Medical issue")}
          </div>
          {issueSelect}
          {sessionTreats.length > 0 && <LoggedTreats treats={sessionTreats} />}
          {/* Pee and Poop (TEC-186): a Fun form only, on a new entry. Each tap is its own potty entry,
              saved at once and independent of whether this Fun entry is. */}
          {form === "fun" && !editing && funPotty({ type: exType, where }, "pee") && (
            <div className="grid gap-1">
              <span className="text-[11px] uppercase tracking-[0.06em] text-ink-soft">Log a potty now</span>
              <div className="flex flex-wrap gap-2">
                {(["pee", "poop"] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => tapPotty(w)}
                    className="min-h-[44px] rounded-xl border border-line bg-surface px-4 font-bold active:translate-y-px focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-pinstripe"
                  >
                    {POTTY_WHAT_LABELS[w]}
                  </button>
                ))}
              </div>
              <p className="text-[13px] text-ink-soft">
                Logs now as {describe({ kind: "potty", details: funPotty({ type: exType, where }, "pee")! }).detail}. Each tap is
                its own entry, saved right away.
              </p>
              {tapped.length > 0 && (
                <ul aria-live="polite" aria-label="Potty entries logged from this form" className="grid gap-1 text-[13px]">
                  {tapped.map((t) => {
                    const state = unsaved[t.id];
                    return (
                      <li key={t.id} className="flex flex-wrap items-center gap-x-2">
                        <span className="font-semibold">
                          {state === "failed" ? "✗" : state ? "…" : "✓"} {POTTY_WHAT_LABELS[t.what]}
                          {state ? "" : " logged"} {clockTime(t.at)}
                        </span>
                        <span className="text-ink-soft">{t.detail}</span>
                        {state === "saving" && <span className="text-ink-soft">Saving…</span>}
                        {state === "failed" && (
                          <>
                            <span className="text-danger">Not saved</span>
                            <button type="button" onClick={() => onRetry(t.id)} className="min-h-[44px] font-medium underline">
                              Retry
                            </button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </Box>
      )}

      {/* The note: a full-width two-line text box that scrolls past two lines (TEC-199). */}
      <div data-section="note">
        <Field label="Note" htmlFor="f-note">
          <textarea
            id="f-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            required={kind === "health" && healthType !== "medication"}
            aria-required={kind === "health" && healthType !== "medication" ? "true" : undefined}
            placeholder={kind === "health" && healthType !== "medication" ? "What happened?" : "Optional"}
            className={`${inputFull} block resize-none overflow-y-auto leading-snug`}
          />
        </Field>
      </div>
      {/* Photos and files sit below the Note (TEC-172), on every form and on an upcoming item (TEC-203). */}
      <div data-section="photos">
        <PhotoPicker photos={photos} />
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        data-section="save"
        disabled={busy || photoBlock}
        data-autofocus={kind === "weight" && !editing ? undefined : true}
        className="min-h-[44px] rounded-[14px] bg-[var(--tone-2-bg)] px-4 py-2.5 text-lg font-bold text-[var(--tone-2-ink)] shadow-[0_4px_0_var(--tone-2-lip)] active:translate-y-0.5 active:shadow-[0_2px_0_var(--tone-2-lip)] disabled:opacity-60"
      >
        {busy
          ? "Saving…"
          : photos.working
            ? "Uploading attachment…"
            : photos.failed
              ? "Fix the attachment to save"
              : plan
                ? "Save changes"
                : future
                  ? "Save as upcoming"
                  : editing
                    ? "Save changes"
                    : `Save ${title.toLowerCase()}`}
      </button>
      {editing ? (
        <button type="button" onClick={remove} disabled={busy} className="min-h-[44px] self-start font-semibold text-danger disabled:opacity-60">
          {confirmDelete ? "Tap again to delete" : "Delete this entry"}
        </button>
      ) : (
        /* Potty has no defaults to explain (nothing is preselected) and drops the helper text (TEC-199). */
        kind !== "potty" && <p className="text-[13px] text-ink-soft">Defaults are filled in. Change only what&apos;s different.</p>
      )}
    </form>
  );
}
