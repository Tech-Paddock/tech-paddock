// Helpers for the tests that drive the Day and Time pop-ups (#64) in a DOM. Not a test file: vitest only runs *.test.ts.
import { expect } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

/** The Day trigger, the Time trigger (the boxes that open the pop-ups). "Next dose" is a Day box with another name. */
export const dayBox = (name = "Day") => screen.getByRole("button", { name: new RegExp(`^${name}:`) });
export const timeBox = () => screen.getByRole("button", { name: /^Time:/ });
export const dialog = () => screen.getByRole("dialog");
export const noDialog = () => expect(screen.queryByRole("dialog")).toBeNull();

const monthName = (y: number, m: number) => new Date(y, m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
const dayName = (y: number, m: number, d: number) => new Date(y, m, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

/** Opens a Day box, pages the calendar to the month of `iso` (`YYYY-MM-DD`) and taps the day, which closes the pop-up. */
export function pickDay(iso: string, name = "Day") {
  const [y, m, d] = iso.split("-").map(Number);
  fireEvent.click(dayBox(name));
  const pop = within(dialog());
  for (let i = 0; i < 400 && !pop.queryByText(monthName(y, m - 1)); i++) {
    const shown = pop.getByText(/^\D+ \d{4}$/).textContent!;
    const target = y * 12 + (m - 1);
    const here = new Date(`1 ${shown}`);
    const at = here.getFullYear() * 12 + here.getMonth();
    fireEvent.click(pop.getByRole("button", { name: at < target ? "Next month" : "Previous month" }));
  }
  fireEvent.click(pop.getByRole("button", { name: dayName(y, m - 1, d) }));
}

/** The compact menu's box (Hour, Minute, AM or PM) inside the Time pop-up. */
export const menuBox = (name: string) => within(dialog()).getByRole("combobox", { name });
/** An option's words, without its tick. */
export const optionText = (o: HTMLElement) => o.querySelector("span")!.textContent!;
/** Opens a compact menu (one already open stays open) and returns its listbox. */
export function openMenu(name: string): HTMLElement {
  if (menuBox(name).getAttribute("aria-expanded") !== "true") fireEvent.click(menuBox(name));
  return within(dialog()).getByRole("listbox", { name });
}
/** The options of a compact menu, opened: their words, which one is ticked, and which are greyed out. */
export function menuOptions(name: string) {
  const rows = within(openMenu(name)).getAllByRole("option");
  return {
    rows,
    texts: rows.map(optionText),
    ticked: rows.filter((r) => r.getAttribute("aria-selected") === "true").map(optionText),
    disabled: rows.filter((r) => r.getAttribute("aria-disabled") === "true").map(optionText),
  };
}
/** Opens a compact menu and taps the option with these words, which picks it and closes the menu. */
export function pickMenu(name: string, text: string) {
  const row = within(openMenu(name)).getAllByRole("option").find((r) => optionText(r) === text);
  if (!row) throw new Error(`no option ${text} in ${name}`);
  fireEvent.click(row);
}

/**
 * Opens the Time box, sets AM or PM, hour and minute from its compact menus and taps Done. AM or PM goes first, as a
 * person has to: on a day with a no-future rule the hours after now are greyed out, so with the box on PM at 4 PM an
 * 11 can only be reached from AM. Picking the hour first taps a greyed-out row and the form clamps it to now, which made
 * a past-time test pass or fail by the hour it ran at (#75).
 */
export function pickTime(hour: number, minute: number, pm: boolean) {
  fireEvent.click(timeBox());
  pickMenu("AM or PM", pm ? "PM" : "AM");
  pickMenu("Hour", String(hour));
  pickMenu("Minute", `:${String(minute).padStart(2, "0")}`);
  fireEvent.click(within(dialog()).getByRole("button", { name: "Done" }));
}

/** Sets the whole row to a local date-and-time (`YYYY-MM-DDTHH:mm`): the day, then the time. */
export function setWhen(value: string) {
  pickDay(value.slice(0, 10));
  const h = Number(value.slice(11, 13));
  pickTime(h % 12 === 0 ? 12 : h % 12, Number(value.slice(14, 16)), h >= 12);
}
