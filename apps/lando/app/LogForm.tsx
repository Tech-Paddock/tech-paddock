"use client";

import { useRef, useState } from "react";
import {
  COMMANDS,
  EXERCISE_TYPES,
  EXERCISE_LABELS,
  InvalidEvent,
  KIND_LABELS,
  UNITS,
  exercise as asExercise,
  food as asFood,
  parseDetails,
  potty as asPotty,
  weight as asWeight,
  type CommandId,
  type Details,
  type ExerciseType,
  type JournalEvent,
  type LogKind,
  type Unit,
} from "@/lib/events";
import { formatAmount, parseAmount, picklist, findFood, unitLabel, type FoodType } from "@/lib/foods";
import { defaultAmount, defaultFood, type Remembered } from "@/lib/defaults";
import { fromLocalInput, toLocalInput } from "@/lib/localtime";

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
  kind: LogKind;
  /** Set when correcting an entry; the form opens on its values. */
  event?: JournalEvent;
  people: Person[];
  phonePerson: string | null;
  remembered: Remembered;
  weightUnit: Unit;
  /** A new entry: handed off at once, never awaited (charter, Never 5). */
  onLog: (body: LogBody) => void;
  /** A correction or a delete: awaited, and its error shown here. */
  onChange: (body: Record<string, unknown>) => Promise<{ error: string | null }>;
};

/* ── Small parts ─────────────────────────────────────────────────────────── */

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  const lbl = "text-[13px] uppercase tracking-[0.06em] text-ink-soft";
  return (
    <div className="grid min-w-0 gap-1.5">
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

const YES_NO = [
  ["no", "No"],
  ["yes", "Yes"],
] as const;
const WHERE_OPTS = [
  ["outside", "Outside"],
  ["inside", "Inside"],
] as const;

/* ── The form ────────────────────────────────────────────────────────────── */

export default function LogForm({ kind, event, people, phonePerson, remembered, weightUnit, onLog, onChange }: Props) {
  const editing = !!event;
  const openedAt = useRef(new Date().toISOString());

  // Common
  const [when, setWhen] = useState(toLocalInput(event?.at ?? openedAt.current));
  const [whenTouched, setWhenTouched] = useState(false);
  const [personId, setPersonId] = useState(event ? event.person_id ?? "" : phonePerson ?? "");
  const [note, setNote] = useState(event?.note ?? "");

  // Potty
  const p = event?.kind === "potty" ? asPotty(event) : null;
  const [what, setWhat] = useState(p?.what ?? "pee");
  const [where, setWhere] = useState(p?.where ?? (event?.kind === "exercise" ? asExercise(event).where : "outside"));

  // Food
  const f = event?.kind === "food" ? asFood(event) : null;
  const [foodType, setFoodType] = useState<FoodType>(f?.type ?? "meal");
  const [itemId, setItemId] = useState(f?.item_id ?? defaultFood("meal", remembered));
  const firstAmount = f ? f.amount : defaultAmount("meal", remembered);
  const [amount, setAmount] = useState(firstAmount === null ? "" : formatAmount(firstAmount));

  // Exercise
  const x = event?.kind === "exercise" ? asExercise(event) : null;
  const [exType, setExType] = useState<ExerciseType>(x?.type ?? "walk");
  const [withDogs, setWithDogs] = useState<"yes" | "no">(x?.with_dogs ? "yes" : "no");
  const [minutes, setMinutes] = useState(String(x?.minutes ?? 15));
  const [treats, setTreats] = useState(String(x?.treats ?? 0));
  const [commands, setCommands] = useState<CommandId[]>(x?.commands ?? []);

  // Weight
  const w = event?.kind === "weight" ? asWeight(event) : null;
  const [value, setValue] = useState(w ? String(w.value) : "");
  const [unit, setUnit] = useState<Unit>(w?.unit ?? remembered.unit ?? weightUnit);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Fixed when the form opens, so pressing Save again after a lost response
  // is the same row, never a second one.
  const saveId = useRef(crypto.randomUUID());
  const deleteId = useRef(crypto.randomUUID());

  function pickFoodType(t: FoodType) {
    setFoodType(t);
    setItemId(defaultFood(t, remembered));
    const a = defaultAmount(t, remembered);
    setAmount(a === null ? "" : formatAmount(a));
  }

  const item = findFood(foodType, itemId);
  const amountUnit = item?.unit ? unitLabel(item.unit, parseAmount(amount) ?? 2) : null;

  function rawDetails(): Record<string, unknown> {
    switch (kind) {
      case "potty":
        return { what, where };
      case "food":
        return { type: foodType, item_id: itemId, amount: parseAmount(amount) };
      case "exercise":
        return {
          type: exType,
          where,
          with_dogs: withDogs === "yes",
          minutes: Number(minutes),
          treats: Number(treats || 0),
          ...(exType === "training" ? { commands } : {}),
        };
      case "weight":
        return { value: Number(value.replace(",", ".")), unit };
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (kind === "food" && amount.trim() && parseAmount(amount) === null) {
      setError("amount must be a number, like 1, 0.5 or 1/3");
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
    const at = !editing && !whenTouched ? new Date().toISOString() : fromLocalInput(when);
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
    if (!editing) {
      onLog(body);
      return;
    }
    setBusy(true);
    const { error } = await onChange({ ...body, voids: event.id });
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

  const title = KIND_LABELS[kind];

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
      {kind === "potty" && (
        <>
          <Field label="What">
            <Seg name="what" label="What" value={what} onChange={setWhat} options={[["pee", "Pee"], ["poop", "Poop"], ["both", "Both"]] as const} />
          </Field>
          <Field label="Where">
            <Seg name="where" label="Where" value={where} onChange={setWhere} options={WHERE_OPTS} />
          </Field>
          {where === "inside" && <p className="text-[13px] font-semibold text-danger">Inside counts as an accident.</p>}
        </>
      )}

      {kind === "food" && (
        <>
          <Field label="Type">
            <Seg name="type" label="Type" value={foodType} onChange={pickFoodType} options={[["meal", "Meal"], ["treat", "Treat"]] as const} />
          </Field>
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2.5">
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
              <input
                id="f-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={foodType === "meal" ? "1/2" : "1"}
                className={input}
              />
            </Field>
          </div>
          {item?.unit === null && <p className="-mt-2 text-[13px] text-ink-soft">Misc: say what it was in the note.</p>}
        </>
      )}

      {kind === "exercise" && (
        <>
          <Field label="Type">
            <Seg
              name="type"
              label="Type"
              value={exType}
              onChange={setExType}
              options={EXERCISE_TYPES.map((t) => [t, EXERCISE_LABELS[t]] as const)}
            />
          </Field>
          <Field label="Where">
            <Seg name="where" label="Where" value={where} onChange={setWhere} options={WHERE_OPTS} />
          </Field>
          <Field label="With other dogs">
            <Seg name="dogs" label="With other dogs" value={withDogs} onChange={setWithDogs} options={YES_NO} />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Length (min)" htmlFor="f-mins">
              <input id="f-mins" type="number" inputMode="numeric" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={input} />
            </Field>
            <Field label="Treats used" htmlFor="f-treats">
              <input id="f-treats" type="number" inputMode="numeric" min={0} max={500} value={treats} onChange={(e) => setTreats(e.target.value)} className={input} />
            </Field>
          </div>
          {exType === "training" && (
            <Field label="Commands practised">
              <div role="group" aria-label="Commands practised" className="flex flex-wrap gap-1.5">
                {COMMANDS.map(([id, label]) => (
                  <label key={id} className="relative">
                    <input
                      type="checkbox"
                      checked={commands.includes(id)}
                      onChange={(e) =>
                        setCommands((cur) => (e.target.checked ? [...cur, id] : cur.filter((c) => c !== id)))
                      }
                      className="peer absolute opacity-0"
                    />
                    <span className="block cursor-pointer whitespace-nowrap rounded-full border border-line bg-surface px-3.5 py-2 peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-ink peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pinstripe">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </Field>
          )}
        </>
      )}

      {kind === "weight" && (
        <div className="grid grid-cols-2 gap-2.5">
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

      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2.5">
        <Field label="When" htmlFor="f-when">
          <input
            id="f-when"
            type="datetime-local"
            value={when}
            onChange={(e) => {
              setWhen(e.target.value);
              setWhenTouched(true);
            }}
            className={input}
          />
        </Field>
        <Field label="Human" htmlFor="f-who">
          <select id="f-who" value={personId} onChange={(e) => setPersonId(e.target.value)} className={input}>
            <option value="">Nobody picked</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Note" htmlFor="f-note">
        <input id="f-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Optional" className={input} />
      </Field>

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        data-autofocus={kind === "weight" && !editing ? undefined : true}
        className="rounded-[14px] bg-[var(--tone-2-bg)] p-4 text-lg font-bold text-[var(--tone-2-ink)] shadow-[0_4px_0_var(--tone-2-lip)] active:translate-y-0.5 active:shadow-[0_2px_0_var(--tone-2-lip)] disabled:opacity-60"
      >
        {busy ? "Saving…" : editing ? "Save changes" : `Save ${title.toLowerCase()}`}
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
