/**
 * A date as a bag prints it, turned into the one shape a Postgres `date` and
 * an `<input type="date">` both accept.
 *
 * The roast date is the only field read off the label that is not free text —
 * every other one lands in a `text` column and survives whatever the label
 * said. Roasters print a date every way there is: "2026-08-14", "14 Aug 2026",
 * "ROASTED 08.14.26", "Roast date: 14/08/2026". The vision model is told to
 * report what is legible rather than to normalise, which is right, and means
 * the string it hands back is not a date column's problem to solve.
 *
 * Sending it there anyway is how a bag that scanned perfectly fails to save.
 *
 * So the parse happens here, and **what it cannot read it says it cannot read
 * rather than dropping**: `iso` is null and `text` is what the label said, and
 * the confirm screen shows the two side by side. A date nobody printed and a
 * date nobody could parse are both an empty field, and only one of them is an
 * answer — which is this app's oldest trap, in the one place it had not been
 * applied yet.
 *
 * **Genuinely ambiguous is refused, not guessed.** "05/06/2026" is two real
 * dates a month apart and nothing on the bag says which; picking one would be
 * the same species of invention as rounding a roaster's brewer to the nearest
 * thing on the shelf. It comes back unparsed, with the text, for you to type.
 */

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && !!fromParts(value.slice(0, 4), value.slice(5, 7), value.slice(8, 10));
}

/** What the label said, and what of it could be read as a date. */
export type LabelDate = {
  /** YYYY-MM-DD, or null when nothing here could be read as one date. */
  iso: string | null;
  /** The original, kept whenever it could not be parsed. Null when it could. */
  text: string | null;
};

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/**
 * A real calendar date as YYYY-MM-DD, or null. Rejects the arithmetic Date
 * would happily do for you: new Date("2026-02-30") is the 2nd of March, and a
 * roast date silently moved two days is worse than one you had to retype.
 */
function fromParts(y: string, m: string, d: string): string | null {
  const year = Number(y), month = Number(m), day = Number(d);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // Round-tripping through UTC catches the short months and the leap years
  // without a table of either.
  const asDate = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(asDate.getTime()) || asDate.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** Two digits on a bag is this century. A 1997 roast is not a live possibility. */
function fullYear(y: string): string {
  return y.length === 2 ? `20${y}` : y;
}

export function parseLabelDate(raw: string | null | undefined): LabelDate {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { iso: null, text: null };

  const iso = readDate(text);
  // The original is kept only when it could not be read. Once it parses, the
  // ISO value is the whole of what the label said and a second copy of it
  // would be one fact with two homes.
  return iso ? { iso, text: null } : { iso: null, text };
}

function readDate(text: string): string | null {
  // Year first is unambiguous by construction: 2026-08-14, 2026/8/14.
  const yFirst = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (yFirst) return fromParts(yFirst[1], yFirst[2], yFirst[3]);

  // "14 Aug 2026", "14th August, 26", "14-AUG-2026".
  const dayMonth = text.match(/(\d{1,2})(?:st|nd|rd|th)?[-/.\s]+([A-Za-z]{3,})\.?,?[-/.\s]+(\d{2,4})/);
  if (dayMonth) {
    const month = MONTHS[dayMonth[2].slice(0, 3).toLowerCase()];
    if (month) return fromParts(fullYear(dayMonth[3]), month, dayMonth[1]);
  }

  // "Aug 14, 2026", "August 14 26".
  const monthDay = text.match(/([A-Za-z]{3,})\.?[-/.\s]+(\d{1,2})(?:st|nd|rd|th)?,?[-/.\s]+(\d{2,4})/);
  if (monthDay) {
    const month = MONTHS[monthDay[1].slice(0, 3).toLowerCase()];
    if (month) return fromParts(fullYear(monthDay[3]), month, monthDay[2]);
  }

  // All-numeric, year last. This is the one that cannot always be read:
  // 05/06/2026 is the 5th of June and the 6th of May, and the bag does not
  // say which. It is only answerable when one of the two is too large to be
  // a month, and when it is not, the date comes back unparsed rather than
  // guessed — a roast date is the age of the coffee, and a month out is a
  // different coffee.
  const numeric = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (numeric) {
    const [a, b] = [Number(numeric[1]), Number(numeric[2])];
    const year = fullYear(numeric[3]);
    if (a > 12 && b <= 12) return fromParts(year, numeric[2], numeric[1]);
    if (b > 12 && a <= 12) return fromParts(year, numeric[1], numeric[2]);
    return null;
  }

  return null;
}

/**
 * A label's roast date as the confirm screen holds it: the form field, and
 * what to say beside it.
 *
 * `value` is what goes in the date input — YYYY-MM-DD or empty — and it is the
 * only thing ever posted, so the save route never meets "08.14.26" and never
 * refuses a bag that scanned perfectly. `unread` is the label's own wording
 * when it could not be read as one date, for the hint beside the empty box.
 *
 * Until 2026-09-25 the page imported `parseLabelDate` and never called it: the
 * label's text went straight into the form, the date input showed it as
 * blank, and the save was refused with "roast date must be YYYY-MM-DD".
 */
export function roastDateFromLabel(raw: string | null | undefined): { value: string; unread: string | null } {
  const { iso, text } = parseLabelDate(raw);
  return { value: iso ?? "", unread: text };
}
