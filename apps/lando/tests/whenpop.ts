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

/** Opens the Time box, sets hour, minute and AM or PM in its picklists and taps Done. */
export function pickTime(hour: number, minute: number, pm: boolean) {
  fireEvent.click(timeBox());
  const pop = within(dialog());
  fireEvent.change(pop.getByLabelText("Hour"), { target: { value: String(hour) } });
  fireEvent.change(pop.getByLabelText("Minute"), { target: { value: String(minute) } });
  fireEvent.change(pop.getByLabelText("AM or PM"), { target: { value: pm ? "1" : "0" } });
  fireEvent.click(pop.getByRole("button", { name: "Done" }));
}

/** Sets the whole row to a local date-and-time (`YYYY-MM-DDTHH:mm`): the day, then the time. */
export function setWhen(value: string) {
  pickDay(value.slice(0, 10));
  const h = Number(value.slice(11, 13));
  pickTime(h % 12 === 0 ? 12 : h % 12, Number(value.slice(14, 16)), h >= 12);
}
