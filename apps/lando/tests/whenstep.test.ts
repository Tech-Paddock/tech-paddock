// @vitest-environment jsdom
// TEC-261 (after TEC-258, TEC-255, TEC-252): the When row is back at the bottom, beside Logging as, each half the row. A
// day box (a transparent date input over all of it) and one time box (hour, minute and AM/PM scroll in place), with Save
// on its own line below. One tap on Save saves at the chosen time and nothing opens after it. Rendered in a DOM so the
// taps are real. jsdom cannot prove scroll-snap or the phone's calendar opening: those are phone checks.
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import LogForm from "@/app/LogForm";
import NoteForm from "@/app/NoteForm";
import type { FormKind, JournalEvent } from "@/lib/events";
import { clock12, toDateInput, toLocalInput, withClock, withDay } from "@/lib/localtime";

// Invented ids. Nothing here is a real record (RULES.md, Never 2).
const PERSON = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const baseProps = () => ({
  people: [{ id: PERSON, display_name: "Tester" }],
  dogs: [],
  onAddDog: async () => ({ dog: null, error: null }),
  foods: [],
  onAddFood: async () => ({ food: null, error: null }),
  medications: [],
  onAddMedication: async () => ({ medication: null, error: null }),
  phonePerson: PERSON,
  events: [] as JournalEvent[],
  photoUrls: {},
  onPhotoUrl: () => {},
  remembered: {},
  weightUnit: "lb" as const,
  onLog: vi.fn<(...a: unknown[]) => void>(),
  onChange: vi.fn<(...a: unknown[]) => Promise<{ error: string | null }>>(async () => ({ error: null })),
  onUpcoming: vi.fn<(...a: unknown[]) => Promise<{ error: string | null }>>(async () => ({ error: null })),
  onPotty: () => {},
  unsaved: {},
  onRetry: () => {},
});

function open(form: FormKind, extra: Record<string, unknown> = {}) {
  const props = { ...baseProps(), ...extra };
  render(createElement(LogForm, { ...props, form } as never));
  return props;
}

afterEach(() => cleanup());

const saveButton = () => screen.getByRole("button", { name: /^(Save|Retry)/ });
const pickPee = () => fireEvent.click(screen.getByLabelText("Pee"));
const dateInput = () => screen.getByLabelText("Date") as HTMLInputElement;
const column = (name: "Day" | "Hour" | "Minute" | "AM or PM") => screen.getByRole("spinbutton", { name });
const noDialog = () => expect(screen.queryByRole("dialog")).toBeNull();

const HOUR_ORDER = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
/** Scrolls a time column to a row, as a swipe does, and waits for it to settle. */
async function scrollTo(name: "Day" | "Hour" | "Minute" | "AM or PM", index: number) {
  const el = column(name);
  el.scrollTop = index * 20;
  fireEvent.scroll(el);
  await waitFor(() => expect(Number(el.getAttribute("aria-valuenow"))).toBe(index));
}
/** Sets the whole When row to a local date-and-time: the calendar, then the three scroll columns. */
async function setWhen(value: string) {
  fireEvent.change(dateInput(), { target: { value: value.slice(0, 10) } });
  const c = clock12(value);
  await scrollTo("Hour", HOUR_ORDER.indexOf(c.hour));
  await scrollTo("Minute", c.minute);
  await scrollTo("AM or PM", c.pm ? 1 : 0);
}

const nowLocal = () => toLocalInput(new Date().toISOString());
const hoursFromNow = (h: number) => toLocalInput(new Date(Date.now() + h * 3600_000).toISOString());
const stored = (at: string) =>
  ({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    kind: "potty",
    at,
    person_id: PERSON,
    details: { what: "pee", where: "outside" },
    note: null,
    voids: null,
    created_at: at,
  }) as unknown as JournalEvent;

describe("the When row (TEC-261)", () => {
  it("is the bottom row: When and Logging as, each half, with Save on its own line below and no When sheet", () => {
    open("potty");
    const row = document.querySelector('[data-section="when-who"]') as HTMLElement;
    expect(row.className).toContain("grid-cols-2");
    expect(within(row).getByText("When")).toBeTruthy();
    expect(within(row).getByLabelText("Logging as")).toBeTruthy();
    // Save is its own line after the row, and nothing opens when the form is shown.
    expect(row.contains(saveButton())).toBe(false);
    expect(row.compareDocumentPosition(saveButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Now" })).toBeNull();
    noDialog();
  });

  it("is on every form, the Note form included", () => {
    for (const form of ["potty", "food", "fun", "training", "weight", "health"] as FormKind[]) {
      cleanup();
      open(form);
      expect(document.querySelector('[data-section="when-who"]'), form).not.toBeNull();
      expect(dateInput(), form).toBeTruthy();
    }
    cleanup();
    render(createElement(NoteForm, noteProps()));
    expect(document.querySelector('[data-section="when-who"]')).not.toBeNull();
  });

  it("has a day column reading Today, a transparent date input under it, and showPicker on a plain tap", () => {
    const showPicker = vi.fn();
    (HTMLInputElement.prototype as unknown as { showPicker: () => void }).showPicker = showPicker;
    try {
      open("potty");
      const input = dateInput();
      expect(input.type).toBe("date");
      expect(input.className).toContain("opacity-0");
      // The input is not touchable, so it never blocks a swipe on the column.
      expect(input.className).toContain("pointer-events-none");
      const day = screen.getByRole("spinbutton", { name: "Day" });
      expect(day.getAttribute("aria-valuetext")).toBe("Today");
      fireEvent.click(day);
      expect(showPicker).toHaveBeenCalledTimes(1);
    } finally {
      delete (HTMLInputElement.prototype as unknown as { showPicker?: () => void }).showPicker;
    }
  });

  it("survives a browser that refuses showPicker", () => {
    (HTMLInputElement.prototype as unknown as { showPicker: () => void }).showPicker = () => {
      throw new Error("NotAllowedError");
    };
    try {
      open("potty");
      expect(() => fireEvent.click(screen.getByRole("spinbutton", { name: "Day" }))).not.toThrow();
    } finally {
      delete (HTMLInputElement.prototype as unknown as { showPicker?: () => void }).showPicker;
    }
  });

  it("has one time box with the hour, minute and AM/PM as spinbuttons, opening on now", () => {
    open("potty");
    const group = screen.getByRole("group", { name: "Time" });
    const c = clock12(nowLocal());
    expect(within(group).getByRole("spinbutton", { name: "Hour" }).getAttribute("aria-valuetext")).toBe(String(c.hour));
    expect(within(group).getByRole("spinbutton", { name: "Minute" }).getAttribute("aria-valuetext")).toBe(String(c.minute).padStart(2, "0"));
    expect(within(group).getByRole("spinbutton", { name: "AM or PM" }).getAttribute("aria-valuetext")).toBe(c.pm ? "PM" : "AM");
    // The box is drawn like the original 44px field.
    expect(group.className).toContain("h-[44px]");
    expect(column("Hour").className).toContain("snap-y");
  });

  it("steps from the keyboard: arrows, Page keys, Home and End", () => {
    open("potty");
    const min = column("Minute");
    fireEvent.keyDown(min, { key: "Home" });
    expect(min.getAttribute("aria-valuetext")).toBe("00");
    fireEvent.keyDown(min, { key: "ArrowDown" });
    expect(min.getAttribute("aria-valuetext")).toBe("01");
    fireEvent.keyDown(min, { key: "PageDown" });
    expect(min.getAttribute("aria-valuetext")).toBe("06");
    fireEvent.keyDown(min, { key: "ArrowUp" });
    expect(min.getAttribute("aria-valuetext")).toBe("05");
    fireEvent.keyDown(min, { key: "End" });
    expect(min.getAttribute("aria-valuetext")).toBe("59");
    const ap = column("AM or PM");
    fireEvent.keyDown(ap, { key: "Home" });
    expect(ap.getAttribute("aria-valuetext")).toBe("AM");
    fireEvent.keyDown(ap, { key: "ArrowDown" });
    expect(ap.getAttribute("aria-valuetext")).toBe("PM");
  });

  it("a swipe on a column picks that row", async () => {
    open("potty");
    await scrollTo("Minute", 17);
    expect(column("Minute").getAttribute("aria-valuetext")).toBe("17");
    await scrollTo("Hour", 0);
    expect(column("Hour").getAttribute("aria-valuetext")).toBe("12");
  });

  it("is a day only on Weight: no time box", () => {
    open("weight");
    expect(dateInput()).toBeTruthy();
    expect(screen.queryByRole("spinbutton", { name: "Hour" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Time" })).toBeNull();
  });
});

describe("Save (TEC-261)", () => {
  it("one tap logs at now on every form, and nothing opens after Save", () => {
    const forms: [FormKind, Record<string, unknown>][] = [
      ["potty", {}],
      ["food", {}],
      ["fun", {}],
      ["training", {}],
      ["weight", {}],
    ];
    for (const [form] of forms) {
      cleanup();
      const props = open(form);
      if (form === "potty") pickPee();
      if (form === "weight") fireEvent.change(screen.getByLabelText(/Weight/, { selector: "input" }), { target: { value: "7.3" } });
      fireEvent.click(saveButton());
      expect(props.onLog, form).toHaveBeenCalledTimes(1);
      expect(props.onUpcoming, form).not.toHaveBeenCalled();
      noDialog();
    }
  });

  it("logs the moment of the save when the row was never touched", () => {
    const props = open("potty");
    pickPee();
    fireEvent.click(saveButton());
    const [body] = props.onLog.mock.calls[0] as unknown as [{ at: string; kind: string; person_id: string }];
    expect(body.kind).toBe("potty");
    expect(body.person_id).toBe(PERSON);
    expect(Math.abs(Date.now() - Date.parse(body.at))).toBeLessThan(5000);
  });

  it("an earlier time and day is logged at that time", async () => {
    const props = open("potty");
    pickPee();
    const earlier = withDay(hoursFromNow(-3), toDateInput(new Date(Date.now() - 26 * 3600_000).toISOString()));
    await setWhen(earlier);
    expect(screen.getByLabelText("Date").parentElement!.textContent).toMatch(/Yesterday|[A-Z][a-z]{2} \d/);
    fireEvent.click(saveButton());
    const [body] = props.onLog.mock.calls[0] as unknown as [{ at: string }];
    expect(toLocalInput(body.at)).toBe(earlier);
    expect(props.onUpcoming).not.toHaveBeenCalled();
  });

  it("a Weight saves on the day picked", async () => {
    const props = open("weight");
    fireEvent.change(screen.getByLabelText(/Weight/, { selector: "input" }), { target: { value: "7.3" } });
    const day = toDateInput(new Date(Date.now() - 3 * 86400_000).toISOString());
    fireEvent.change(dateInput(), { target: { value: day } });
    fireEvent.click(saveButton());
    const [body] = props.onLog.mock.calls[0] as unknown as [{ at: string }];
    expect(toDateInput(body.at)).toBe(day);
  });

  it("a form's own mistake is shown on the form and the time stays", async () => {
    open("potty");
    const earlier = hoursFromNow(-2);
    await setWhen(earlier);
    fireEvent.click(saveButton());
    expect(screen.getByRole("alert").textContent).toMatch(/Pick what happened/);
    expect(dateInput().value).toBe(earlier.slice(0, 10));
    expect(column("Minute").getAttribute("aria-valuetext")).toBe(String(clock12(earlier).minute).padStart(2, "0"));
    noDialog();
  });
});

describe("a future time (TEC-261)", () => {
  const tomorrow = () => withClock(withDay(nowLocal(), toDateInput(new Date(Date.now() + 2 * 86400_000).toISOString())), { hour: 9, minute: 30, pm: false });

  it("shows the form's Repeat under the row and the notice, and Save reads Save plan", async () => {
    open("potty");
    expect(screen.queryByText("Future: saves as upcoming")).toBeNull();
    expect(screen.queryByText("Repeat")).toBeNull();
    pickPee();
    await setWhen(tomorrow());
    expect(screen.getByText("Future: saves as upcoming")).toBeTruthy();
    expect(screen.getByText("Repeat")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save plan" })).toBeTruthy();
    const row = document.querySelector('[data-section="when-who"]') as HTMLElement;
    const plan = document.querySelector('[data-section="plan"]') as HTMLElement;
    expect(row.compareDocumentPosition(plan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(plan.compareDocumentPosition(saveButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("one tap on Save plan saves an upcoming item, not an entry", async () => {
    const props = open("potty");
    pickPee();
    const later = tomorrow();
    await setWhen(later);
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(props.onUpcoming).toHaveBeenCalledTimes(1));
    expect(props.onLog).not.toHaveBeenCalled();
    expect(props.onUpcoming.mock.calls[0][0]).toMatchObject({ due_on: later.slice(0, 10), due_time: "09:30" });
    noDialog();
  });

  it("with Repeat ticked saves the chosen repeat", async () => {
    const props = open("potty");
    pickPee();
    await setWhen(tomorrow());
    fireEvent.click(screen.getByLabelText("Repeat"));
    fireEvent.change(screen.getByLabelText("Repeat every"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Repeat unit"), { target: { value: "month" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(props.onUpcoming).toHaveBeenCalledTimes(1));
    expect(props.onUpcoming.mock.calls[0][0]).toMatchObject({ repeat_every: 2, repeat_unit: "month" });
    expect(props.onLog).not.toHaveBeenCalled();
  });

  it("a failed save keeps the chosen time: Save reads Retry, and Retry saves the same plan", async () => {
    const onUpcoming = vi.fn().mockResolvedValueOnce({ error: "Could not save" }).mockResolvedValueOnce({ error: null });
    open("potty", { onUpcoming });
    pickPee();
    const later = tomorrow();
    await setWhen(later);
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Could not save"));
    expect(dateInput().value).toBe(later.slice(0, 10));
    expect(column("Hour").getAttribute("aria-valuetext")).toBe("9");
    expect(column("Minute").getAttribute("aria-valuetext")).toBe("30");
    noDialog();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onUpcoming).toHaveBeenCalledTimes(2));
    noDialog();
    expect(onUpcoming.mock.calls[1][0]).toMatchObject({ due_on: later.slice(0, 10), due_time: "09:30" });
  });

  it("Weight in the future is a plan on that day", async () => {
    const props = open("weight");
    fireEvent.change(screen.getByLabelText(/Weight/, { selector: "input" }), { target: { value: "7.3" } });
    const day = toDateInput(new Date(Date.now() + 3 * 86400_000).toISOString());
    fireEvent.change(dateInput(), { target: { value: day } });
    expect(screen.getByText("Future: saves as upcoming")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(props.onUpcoming).toHaveBeenCalledTimes(1));
    expect(props.onUpcoming.mock.calls[0][0]).toMatchObject({ due_on: day });
    expect(props.onLog).not.toHaveBeenCalled();
  });
});

describe("a form that opens on a time of its own (TEC-261)", () => {
  it("a correction opens on the entry's stored time, and untouched leaves the time to the millisecond", async () => {
    const at = "2026-10-19T21:05:07.123Z";
    const event = stored(at);
    const props = open("potty", { event });
    const local = toLocalInput(at);
    expect(dateInput().value).toBe(local.slice(0, 10));
    const c = clock12(local);
    expect(column("Hour").getAttribute("aria-valuetext")).toBe(String(c.hour));
    expect(column("Minute").getAttribute("aria-valuetext")).toBe(String(c.minute).padStart(2, "0"));
    expect(column("AM or PM").getAttribute("aria-valuetext")).toBe(c.pm ? "PM" : "AM");
    fireEvent.click(saveButton());
    await waitFor(() => expect(props.onChange).toHaveBeenCalledTimes(1));
    expect(props.onChange.mock.calls[0][0]).toMatchObject({ at, voids: event.id });
    noDialog();
  });

  it("a correction moved to another time saves that time", async () => {
    const props = open("potty", { event: stored("2026-10-19T21:05:07.123Z") });
    const other = hoursFromNow(-30);
    await setWhen(other);
    fireEvent.click(saveButton());
    await waitFor(() => expect(props.onChange).toHaveBeenCalledTimes(1));
    expect(toLocalInput((props.onChange.mock.calls[0][0] as { at: string }).at)).toBe(other);
  });

  it("a correction cannot be moved to the future", async () => {
    const props = open("potty", { event: stored("2026-10-19T21:05:07.123Z") });
    fireEvent.change(dateInput(), { target: { value: toDateInput(new Date(Date.now() + 3 * 86400_000).toISOString()) } });
    fireEvent.click(saveButton());
    expect(screen.getByRole("alert").textContent).toMatch(/can't move to the future/);
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onUpcoming).not.toHaveBeenCalled();
  });

  it("the Calendar's Add a plan opens on that day, as a plan", async () => {
    const day = toDateInput(new Date(Date.now() + 3 * 86400_000).toISOString());
    const props = open("training", { planDay: day });
    expect(dateInput().value).toBe(day);
    expect(screen.getByText("Future: saves as upcoming")).toBeTruthy();
    expect(screen.getByText("Repeat")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(props.onUpcoming).toHaveBeenCalledTimes(1));
    expect(props.onUpcoming.mock.calls[0][0]).toMatchObject({ due_on: day });
    expect(props.onLog).not.toHaveBeenCalled();
  });
});

function noteProps() {
  return {
    people: [{ id: PERSON, display_name: "Tester" }],
    phonePerson: PERSON,
    photoUrls: {},
    onPhotoUrl: () => {},
    onLog: vi.fn<(...a: unknown[]) => void>(),
    onChange: vi.fn<(...a: unknown[]) => Promise<{ error: string | null }>>(async () => ({ error: null })),
  };
}

describe("the Note form's When row (TEC-261)", () => {
  const write = () => fireEvent.change(screen.getByPlaceholderText("Write the note"), { target: { value: "Invented words" } });

  it("has the row, and one tap on Save logs the note with nothing opening", () => {
    const props = noteProps();
    render(createElement(NoteForm, props));
    expect(screen.getByLabelText("Logging as")).toBeTruthy();
    write();
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(props.onLog).toHaveBeenCalledTimes(1);
    noDialog();
  });

  it("stops the calendar at today and refuses a future day, with no Repeat", () => {
    const props = noteProps();
    render(createElement(NoteForm, props));
    expect(dateInput().max).toBe(toDateInput(new Date().toISOString()));
    write();
    fireEvent.change(dateInput(), { target: { value: toDateInput(new Date(Date.now() + 3 * 86400_000).toISOString()) } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(screen.getByRole("alert").textContent).toMatch(/future/i);
    expect(props.onLog).not.toHaveBeenCalled();
    expect(screen.queryByText("Repeat")).toBeNull();
  });

  it("logs a past time picked in the row", async () => {
    const props = noteProps();
    render(createElement(NoteForm, props));
    write();
    const earlier = hoursFromNow(-5);
    await setWhen(earlier);
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    const [body] = props.onLog.mock.calls[0] as unknown as [{ at: string }];
    expect(toLocalInput(body.at)).toBe(earlier);
  });
});

describe("the When row shows that it scrolls (TEC-266)", () => {
  // jsdom cannot prove scroll-snap, the fade or the roll on a phone; these prove the wiring.
  const matchMedia = (reduce: boolean) => (q: string) => ({ matches: reduce && q.includes("reduce") }) as MediaQueryList;
  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    delete (HTMLElement.prototype as unknown as { scrollTo?: unknown }).scrollTo;
  });

  it("each column is a short row with a fade, so the rows either side peek", () => {
    open("potty");
    for (const name of ["Day", "Hour", "Minute", "AM or PM"] as const) {
      const el = column(name);
      expect(el.style.height).toBe("42px");
      expect(el.style.maskImage || el.style.webkitMaskImage || el.getAttribute("style")).toContain("linear-gradient");
      const rows = Array.from(el.children).filter((r) => r.textContent);
      expect(rows.every((r) => (r as HTMLElement).style.height === "20px"), name).toBe(true);
    }
    expect(document.querySelector('[data-section="when-who"]')!.querySelectorAll(".text-ink-soft").length).toBeGreaterThan(0);
  });

  it("the day column lists Yesterday, Today, Tomorrow and dates, about 2 weeks back to 30 days ahead", () => {
    open("potty");
    const texts = Array.from(column("Day").children)
      .map((r) => r.textContent)
      .filter(Boolean);
    expect(texts.length).toBe(45);
    const i = texts.indexOf("Today");
    expect(texts.slice(i - 1, i + 2)).toEqual(["Yesterday", "Today", "Tomorrow"]);
    expect(i).toBe(14);
  });

  it("scrolling the day sets the day and keeps the clock", async () => {
    const n = new Date();
    const dayAt = (k: number) => toDateInput(new Date(n.getFullYear(), n.getMonth(), n.getDate() + k, 12).toISOString());
    open("potty", { event: stored(new Date(n.getFullYear(), n.getMonth(), n.getDate() - 3, 8, 30).toISOString()) });
    expect(dateInput().value).toBe(dayAt(-3));
    expect(column("Minute").getAttribute("aria-valuetext")).toBe("30");
    const el = column("Day");
    const before = Number(el.getAttribute("aria-valuenow"));
    el.scrollTop = (before + 1) * 20;
    fireEvent.scroll(el);
    await waitFor(() => expect(Number(el.getAttribute("aria-valuenow"))).toBe(before + 1));
    expect(dateInput().value).toBe(dayAt(-2));
    expect(column("Minute").getAttribute("aria-valuetext")).toBe("30");
    expect(column("Hour").getAttribute("aria-valuetext")).toBe("8");
  });

  it("a day beyond the list (picked in the calendar) is kept and shown", () => {
    open("potty");
    fireEvent.change(dateInput(), { target: { value: "2031-05-04" } });
    expect(dateInput().value).toBe("2031-05-04");
    expect(column("Day").getAttribute("aria-valuetext")).not.toBe("Today");
    expect(column("Day").children.length).toBeGreaterThan(45);
  });

  it("Weight's day is a scroll column too, with no time box", () => {
    open("weight");
    expect(column("Day")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Time" })).toBeNull();
  });

  it("the nudge rolls each column once, staggered, with snap off, and puts it back without changing the pick", () => {
    vi.useFakeTimers();
    (window as unknown as { matchMedia: unknown }).matchMedia = matchMedia(false);
    const calls: [string, number][] = [];
    (HTMLElement.prototype as unknown as { scrollTo: (o: ScrollToOptions) => void }).scrollTo = function (this: HTMLElement, o: ScrollToOptions) {
      calls.push([this.getAttribute("aria-label") ?? "", o.top ?? 0]);
      this.scrollTop = o.top ?? 0;
      fireEvent.scroll(this);
    };
    open("potty");
    const day = column("Day");
    const minuteBefore = column("Minute").getAttribute("aria-valuetext");
    vi.advanceTimersByTime(300);
    expect(calls.map((c) => c[0])).toEqual(["Day"]);
    expect(day.style.scrollSnapType).toBe("none");
    vi.advanceTimersByTime(2000);
    const labels = calls.map((c) => c[0]);
    expect(labels.filter((l) => l === "Day").length).toBe(2); // out, then back
    expect(["Day", "Hour", "Minute", "AM or PM"].every((l) => labels.includes(l))).toBe(true);
    expect(labels.indexOf("Hour")).toBeGreaterThan(labels.indexOf("Day"));
    expect(Math.abs(calls[0][1] - Number(day.getAttribute("aria-valuenow")) * 20)).toBe(16);
    expect(day.style.scrollSnapType).toBe("");
    expect(day.getAttribute("aria-valuetext")).toBe("Today");
    expect(column("Minute").getAttribute("aria-valuetext")).toBe(minuteBefore);
    const total = calls.length;
    vi.advanceTimersByTime(5000);
    expect(calls.length).toBe(total); // once only
  });

  it("nothing moves when reduced motion is on", () => {
    vi.useFakeTimers();
    (window as unknown as { matchMedia: unknown }).matchMedia = matchMedia(true);
    const scrollTo = vi.fn();
    (HTMLElement.prototype as unknown as { scrollTo: unknown }).scrollTo = scrollTo;
    open("potty");
    vi.advanceTimersByTime(5000);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
