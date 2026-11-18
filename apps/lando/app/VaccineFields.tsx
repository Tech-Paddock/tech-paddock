"use client";

import { DOSE_MAX, VACCINES, hasDoses, vaccineLabel } from "@/lib/vaccines";
import { dayText } from "@/lib/upcoming";
import { NEXT_STEPS } from "@/lib/vaccine-plan";
import { Field, inputFull } from "./fields";
import Chip from "./Chip";

/**
 * The Vaccine type's picks (TEC-259): which vaccine, and its dose number when it has one. The two share the row, each
 * half of it (TEC-255), and the dose box is empty for a vaccine with no number.
 */
export function VaccinePick({
  vaccine,
  onVaccine,
  dose,
  onDose,
}: {
  vaccine: string;
  onVaccine: (v: string) => void;
  /** The dose number the box shows, as text; "" is "Not sure". */
  dose: string;
  onDose: (d: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 items-start gap-2">
      <Field label="Vaccine" htmlFor="f-vaccine" className="min-w-0">
        <select id="f-vaccine" value={vaccine} onChange={(e) => onVaccine(e.target.value)} className={inputFull}>
          <option value="">Pick one…</option>
          {vaccine && !VACCINES.some((v) => v.id === vaccine) && <option value={vaccine}>{vaccineLabel(vaccine)}</option>}
          {VACCINES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </Field>
      {vaccine && hasDoses(vaccine) ? (
        <Field label="Dose" htmlFor="f-vdose" className="min-w-0">
          <select id="f-vdose" value={dose} onChange={(e) => onDose(e.target.value)} className={inputFull}>
            <option value="">Not sure</option>
            {Array.from({ length: DOSE_MAX }, (_, i) => i + 1).map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <div aria-hidden="true" />
      )}
    </div>
  );
}

const CHIP =
  "block cursor-pointer whitespace-nowrap rounded-full border px-2.5 py-1 text-[15px] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-pinstripe";

/**
 * A vet visit's "Vaccines given": one chip for each vaccine, any number picked. A new visit only. The chips are toggle
 * buttons, so the visit form keeps no checkbox of its own (its Related issue has none, TEC-208).
 */
export function VaccinesGiven({ given, onToggle }: { given: readonly string[]; onToggle: (id: string) => void }) {
  return (
    <Field label="Vaccines given (optional)">
      <div role="group" aria-label="Vaccines given" className="flex flex-wrap gap-x-1">
        {VACCINES.map((v) => {
          const on = given.includes(v.id);
          return (
            <button key={v.id} type="button" aria-pressed={on} onClick={() => onToggle(v.id)} className="flex min-h-[44px] items-center">
              <span className={`${CHIP} ${on ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface"}`}>{v.label}</span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}

/**
 * The offer to plan the next doses (TEC-259), under a vet visit that gave vaccines. It is ticked by default; a plan is saved
 * only once the vaccine itself is. The next dose is chosen in steps, not on a calendar (owner, #73): for each vaccine given,
 * chips for how far out (3–4 weeks, 6 months, 1 year, 3 years), the vaccine's usual gap picked to start, and the day it makes.
 */
export function NextDoseOffer({
  on,
  onOn,
  items,
  onStep,
}: {
  on: boolean;
  onOn: (v: boolean) => void;
  /** A visit's vaccines: the id and label of each, the step picked (a `NEXT_STEPS` id) and the day that makes. */
  items: readonly { id: string; label: string; step: string; day: string }[];
  onStep: (vaccine: string, step: string) => void;
}) {
  return (
    <div data-section="next-dose" className="grid gap-0.5">
      <label className="flex min-h-[44px] items-center gap-2 text-[15px] text-ink-soft">
        <input type="checkbox" checked={on} onChange={(e) => onOn(e.target.checked)} className="h-5 w-5 accent-accent" />
        <span className={on ? "font-semibold text-ink" : ""}>Plan the next doses</span>
      </label>
      {on &&
        items.map((i) => (
          <div key={i.id} className="grid gap-0">
            <span className="text-[13px] text-ink-soft">
              {i.label}: next dose {dayText(i.day)}
            </span>
            <div role="group" aria-label={`${i.label} next dose in`} className="flex flex-wrap gap-x-1">
              {NEXT_STEPS.map((st) => (
                <Chip key={st.id} pressed={i.step === st.id} onClick={() => onStep(i.id, st.id)}>
                  {st.label}
                </Chip>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
