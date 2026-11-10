/**
 * When to suggest a vaccine's next dose, and the upcoming plan it makes (TEC-259). Pure: no database, no clock. The
 * list of vaccines is `vaccines.ts`. These are suggestions: the plan's date stays editable, in the form and in the
 * Calendar afterwards.
 */
import { earlierDoses, parseDetails, type FollowUp, type JournalEvent } from "./events";
import { toDateInput } from "./localtime";
import { daysBetween, isDay, nextDue, parseUpcoming, type UpcomingInput } from "./upcoming";
import { DOSE_MAX, VACCINES, hasDoses, suggestedDose, vaccinePlanTitle } from "./vaccines";

/** The puppy series ends at this age; after it, the next dose is yearly. */
export const PUPPY_WEEKS = 16;

export type NextDose = {
  /** The suggested day, `YYYY-MM-DD`. The person may change it. */
  on: string;
  /** The range the interval is taken from, in words: "3–4 weeks", "1 year". */
  text: string;
  /** Whether the next dose continues a numbered puppy series (so its plan is "dose 3", not just the vaccine). */
  series: boolean;
};

/**
 * When to suggest the next dose, as a day (the first end of a range, because a sooner date is the safer plan and the
 * date stays editable):
 *
 *  - DHPP and Leptospirosis: 3 to 4 weeks while the puppy is under 16 weeks old, then yearly. The age comes from
 *    `birthOn` when it is known. Until the Profile holds one, the dose number stands in: the first two doses are the
 *    puppy series, the third and later are yearly.
 *  - Rabies: 1 year after the first, then every 3 years.
 *  - Bordetella: every 6 to 12 months.
 *
 * `givenOn` is the day this dose was (or will be) given; `dose` its number if it has one; `earlier` how many live
 * entries of the vaccine were logged before it. A vaccine the rules do not know (a retired one) is yearly.
 */
export function nextDose(x: { vaccine: string; givenOn: string; dose?: number | null; earlier?: number; birthOn?: string | null }): NextDose {
  if (!isDay(x.givenOn)) throw new Error("givenOn must be a day");
  const earlier = x.earlier ?? 0;
  const given = x.givenOn;
  switch (x.vaccine) {
    case "dhpp":
    case "leptospirosis": {
      const puppy = x.birthOn && isDay(x.birthOn) ? daysBetween(x.birthOn, given) < PUPPY_WEEKS * 7 : (x.dose ?? earlier + 1) < 3;
      return puppy
        ? { on: nextDue(given, 3, "week"), text: "3–4 weeks", series: true }
        : { on: nextDue(given, 1, "year"), text: "1 year", series: false };
    }
    case "rabies":
      return earlier === 0 && !(x.dose && x.dose > 1)
        ? { on: nextDue(given, 1, "year"), text: "1 year", series: false }
        : { on: nextDue(given, 3, "year"), text: "3 years", series: false };
    case "bordetella":
      return { on: nextDue(given, 6, "month"), text: "6–12 months", series: false };
    default:
      return { on: nextDue(given, 1, "year"), text: "1 year", series: false };
  }
}

/**
 * The upcoming plan for a vaccine's next dose, due on `on` (the suggestion or the day the person typed). Its kind is
 * `vaccine` and its title names the vaccine, and the dose number when the next dose continues the puppy series, so a
 * Done opens the Vaccine form on it. `dose` is the dose just given.
 */
export function nextDosePlan(x: { vaccine: string; dose?: number | null; series: boolean; on: string }): UpcomingInput {
  const next = x.series && hasDoses(x.vaccine) && x.dose && x.dose < DOSE_MAX ? x.dose + 1 : null;
  return parseUpcoming({ kind: "vaccine", title: vaccinePlanTitle(x.vaccine, next), due_on: x.on, due_time: null, note: null, repeat_every: null, repeat_unit: null });
}

/**
 * A vet visit's "Vaccines given" (TEC-259): each vaccine picked becomes its own Vaccine entry at the visit's time and
 * person, linked to the visit by `parent_id`, in the list's order, with the dose number the log implies (one more than
 * those already logged) where the vaccine has one. With `planNext`, each also gets its next dose as a plan, keyed by
 * the entry's id. `idFor` gives each vaccine's entry id, fixed when the form opened so a retry is the same row.
 */
export function visitVaccineEntries(x: {
  given: readonly string[];
  visitId: string;
  at: string;
  personId: string | null;
  events: JournalEvent[];
  /** Lando's birth date from the Profile (TEC-260), when known; the age then decides the puppy series. */
  birthOn?: string | null;
  idFor: (vaccine: string) => string;
  planNext: boolean;
}): { entries: FollowUp[]; plans: Record<string, UpcomingInput> } {
  const entries: FollowUp[] = [];
  const plans: Record<string, UpcomingInput> = {};
  for (const { id: vaccine } of VACCINES.filter((v) => x.given.includes(v.id))) {
    const earlier = earlierDoses(x.events, vaccine, x.at);
    const dose = suggestedDose(vaccine, earlier);
    const id = x.idFor(vaccine);
    entries.push({
      id,
      kind: "health",
      at: x.at,
      person_id: x.personId,
      details: parseDetails("health", { type: "vaccine", vaccine, ...(dose ? { dose } : {}) }),
      note: null,
      parent_id: x.visitId,
    });
    if (x.planNext) {
      const next = nextDose({ vaccine, givenOn: toDateInput(x.at), dose, earlier, birthOn: x.birthOn });
      plans[id] = nextDosePlan({ vaccine, dose, series: next.series, on: next.on });
    }
  }
  return { entries, plans };
}
