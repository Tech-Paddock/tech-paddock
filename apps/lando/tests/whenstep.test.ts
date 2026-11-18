// @vitest-environment jsdom
// #64 (after TEC-261): the form's bottom block is Day, Time, Logging as and Save in two equal columns. Day and Time are
// boxes that open a pop-up window (a month calendar; Now / minutes-ago chips with hour, minute and AM/PM picklists), the
// scroll wheel is gone, minutes step by five, Repeat is always on the form, and Potty (and a note) can't be in the
// future. Rendered in a DOM so the taps are real. jsdom cannot prove how a phone draws the pop-up or opens its native
// picklists: those are phone checks.
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import LogForm, { REPEAT_NEEDS_FUTURE } from "@/app/LogForm";
import NoteForm from "@/app/NoteForm";
import type { FormKind, JournalEvent } from "@/lib/events";
import { clock12, toDateInput, toLocalInput, withClock, withDay } from "@/lib/localtime";
import { dayBox, dialog, noDialog, pickDay, pickTime, setWhen, timeBox } from "./whenpop";

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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const saveButton = () => screen.getByRole("button", { name: /^(Save|Retry)/ });
const pickPee = () => fireEvent.click(screen.getByLabelText("Pee"));
const nowLocal = () => toLocalInput(new Date().toISOString());
/** A local date-and-time, its minute dropped onto the five-minute grid (the only minutes the picklist offers). */
const onGrid = (v: string) => `${v.slice(0, 14)}${String(Math.floor(Number(v.slice(14, 16)) / 5) * 5).padStart(2, "0")}`;
const hoursFromNow = (h: number) => onGrid(toLocalInput(new Date(Date.now() + h * 3600_000).toISOString()));
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
/** Pins the clock without stopping timers, so waitFor and the form's own effects still run. */
const clockAt = (d: Date) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(d);
};

describe("the bottom block (#64)", () => {
  it("is Day, Time, Logging as and Save in two equal columns, in that order, with nothing open", () => {
    open("training");
    const block = document.querySelector('[data-section="when-who"]') as HTMLElement;
    expect(block.className).toContain("grid-cols-2");
    const order = [dayBox(), timeBox(), screen.getByLabelText("Logging as"), saveButton()];
    for (let i = 0; i < order.length - 1; i++) {
      expect(block.contains(order[i]), `cell ${i}`).toBe(true);
      expect(order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING, `order ${i}`).toBeTruthy();
    }
    expect(block.contains(saveButton())).toBe(true);
    noDialog();
  });

  it("has no scroll wheel, no date input and no Yesterday, Today or Tomorrow chips", () => {
    open("potty");
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByLabelText("Date")).toBeNull();
    for (const w of ["Yesterday", "Tomorrow"]) expect(screen.queryByRole("button", { name: w })).toBeNull();
    expect(dayBox().textContent).toContain("Today");
  });

  it("Day, Logging as and Save fill their equal half, 44px tall, as the other fields do", () => {
    open("training");
    for (const el of [dayBox(), timeBox(), screen.getByLabelText("Logging as")]) {
      expect(el.className, el.id).toContain("min-h-[44px]");
      expect(el.className, el.id).toContain("w-full");
    }
    expect(saveButton().className).toContain("h-[44px]");
    expect(saveButton().className).toContain("w-full");
  });

  it("is on every form, the Note form included; a Weight is a day only", () => {
    for (const form of ["potty", "food", "fun", "training", "health"] as FormKind[]) {
      cleanup();
      open(form);
      expect(document.querySelector('[data-section="when-who"]'), form).not.toBeNull();
      expect(dayBox(), form).toBeTruthy();
      expect(timeBox(), form).toBeTruthy();
    }
    cleanup();
    open("weight");
    expect(dayBox()).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Time:/ })).toBeNull();
    cleanup();
    render(createElement(NoteForm, noteProps()));
    expect(dayBox()).toBeTruthy();
    expect(timeBox()).toBeTruthy();
  });

  it("opens on now rounded down to five minutes", () => {
    clockAt(new Date(2026, 10, 17, 14, 38, 41));
    open("food");
    expect(timeBox().textContent).toContain("2:35 PM");
    expect(dayBox().textContent).toContain("Today");
  });
});

describe("the Day pop-up (#64)", () => {
  it("opens a month calendar in a dialog, not a panel down the form, and a tap on a day picks it and closes", async () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    const props = open("food");
    fireEvent.click(dayBox());
    const pop = within(dialog());
    expect(dialog().parentElement!.parentElement).toBe(document.body); // drawn into <body>, over the sheet
    expect(pop.getByText("November 2026")).toBeTruthy();
    expect(pop.getByRole("button", { name: "Previous month" })).toBeTruthy();
    expect(pop.getByRole("button", { name: "Next month" })).toBeTruthy();
    fireEvent.click(pop.getByRole("button", { name: /November 20/ }));
    noDialog();
    expect(dayBox().getAttribute("aria-label")).toContain("Nov 20");
    expect(timeBox().textContent).toContain("2:35 PM"); // the clock stays
    fireEvent.click(saveButton());
    expect(props.onUpcoming).toHaveBeenCalledTimes(1); // the 20th is ahead: a plan
    expect(props.onUpcoming.mock.calls[0][0]).toMatchObject({ due_on: "2026-11-20", due_time: "14:35" });
  });

  it("holds a hold or a drag off the page behind it: select-none, and the page can't scroll while it is open", () => {
    open("food");
    document.body.style.overflow = "";
    fireEvent.click(dayBox());
    expect(dialog().className).toContain("select-none");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(document.body.style.overflow).toBe("");
  });

  it("Escape and a tap on the backdrop cancel without picking, and Escape leaves the sheet below open", () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    open("food");
    const sheet = vi.fn();
    document.addEventListener("keydown", sheet); // the sheet's own Escape listens here, after the pop-up's
    try {
      fireEvent.click(dayBox());
      fireEvent.keyDown(document.body, { key: "Escape" });
      noDialog();
      expect(sheet).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", sheet);
    }
    fireEvent.click(dayBox());
    fireEvent.click(document.querySelector("[data-backdrop]") as HTMLElement);
    noDialog();
    expect(dayBox().getAttribute("aria-label")).toContain("Today");
    expect(document.activeElement).toBe(dayBox()); // focus goes back to the box
  });

  it("pages to another month and picks a day in it", () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    const props = open("food");
    pickDay("2027-02-03");
    expect(dayBox().getAttribute("aria-label")).toContain("Feb 3");
    fireEvent.click(saveButton());
    expect(props.onUpcoming.mock.calls[0][0]).toMatchObject({ due_on: "2027-02-03" });
  });

  it("a day before today is logged at that day and time", () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    const props = open("training");
    pickDay("2026-11-12");
    fireEvent.click(saveButton());
    const [body] = props.onLog.mock.calls[0] as unknown as [{ at: string }];
    expect(toLocalInput(body.at)).toBe("2026-11-12T14:35");
    expect(props.onUpcoming).not.toHaveBeenCalled();
  });

  it("a Weight's Day box is a pop-up too, and saves the day picked", () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    const props = open("weight");
    fireEvent.change(screen.getByLabelText(/Weight/, { selector: "input" }), { target: { value: "7.3" } });
    pickDay("2026-11-14");
    fireEvent.click(saveButton());
    const [body] = props.onLog.mock.calls[0] as unknown as [{ at: string }];
    expect(toDateInput(body.at)).toBe("2026-11-14");
  });
});

describe("the Time pop-up (#64)", () => {
  it("has Now, 15, 30 and 45 min ago and 1 hr ago, then hour, minute and AM/PM, with Cancel and Done", () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    open("food");
    fireEvent.click(timeBox());
    const pop = within(dialog());
    const chips = within(pop.getByRole("group", { name: "How long ago" })).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual(["Now", "15 min ago", "30 min ago", "45 min ago", "1 hr ago"]);
    expect(pop.getByLabelText("Hour").tagName).toBe("SELECT");
    expect(pop.getByLabelText("Minute").tagName).toBe("SELECT");
    expect(pop.getByLabelText("AM or PM").tagName).toBe("SELECT");
    expect(pop.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(pop.getByRole("button", { name: "Done" })).toBeTruthy();
    expect(dialog().className).toContain("select-none");
  });

  it("the minutes step by five, :00 to :55", () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    open("food");
    fireEvent.click(timeBox());
    const opts = Array.from((within(dialog()).getByLabelText("Minute") as HTMLSelectElement).options).map((o) => o.textContent);
    expect(opts).toEqual([":00", ":05", ":10", ":15", ":20", ":25", ":30", ":35", ":40", ":45", ":50", ":55"]);
  });

  it("a shortcut sets the time and Done keeps it: 45 min ago logs at 1:50 PM", () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    const props = open("training");
    fireEvent.click(timeBox());
    fireEvent.click(within(dialog()).getByRole("button", { name: "45 min ago" }));
    expect(within(dialog()).getByRole("button", { name: "45 min ago" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Done" }));
    noDialog();
    expect(timeBox().textContent).toContain("1:50 PM");
    fireEvent.click(saveButton());
    const [body] = props.onLog.mock.calls[0] as unknown as [{ at: string }];
    expect(toLocalInput(body.at)).toBe("2026-11-17T13:50");
  });

  it("Now comes back to this moment on a step, from a day before", () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    open("training");
    pickDay("2026-11-12");
    fireEvent.click(timeBox());
    fireEvent.click(within(dialog()).getByRole("button", { name: "Now" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Done" }));
    expect(dayBox().getAttribute("aria-label")).toContain("Today");
    expect(timeBox().textContent).toContain("2:35 PM");
  });

  it("hour, minute and AM/PM set the time", () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    const props = open("training");
    pickTime(9, 25, false);
    expect(timeBox().textContent).toContain("9:25 AM");
    fireEvent.click(saveButton());
    const [body] = props.onLog.mock.calls[0] as unknown as [{ at: string }];
    expect(toLocalInput(body.at)).toBe("2026-11-17T09:25");
  });

  it("Cancel and Escape leave the time as it was, and an untouched new entry is still saved at the moment of Save", () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    const props = open("training");
    fireEvent.click(timeBox());
    fireEvent.click(within(dialog()).getByRole("button", { name: "1 hr ago" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    noDialog();
    expect(timeBox().textContent).toContain("2:35 PM");
    fireEvent.click(timeBox());
    fireEvent.change(within(dialog()).getByLabelText("Hour"), { target: { value: "3" } });
    fireEvent.keyDown(document.body, { key: "Escape" });
    noDialog();
    expect(timeBox().textContent).toContain("2:35 PM");
    vi.setSystemTime(new Date(2026, 10, 17, 14, 52, 11));
    fireEvent.click(saveButton());
    const [body] = props.onLog.mock.calls[0] as unknown as [{ at: string }];
    expect(toLocalInput(body.at)).toBe("2026-11-17T14:52");
  });

  it("an older entry's own minute stays on the list, so it still shows as it was saved", () => {
    const props = open("potty", { event: stored(new Date(2026, 9, 19, 21, 7, 9).toISOString()) });
    expect(timeBox().textContent).toContain("9:07 PM");
    fireEvent.click(timeBox());
    const opts = Array.from((within(dialog()).getByLabelText("Minute") as HTMLSelectElement).options).map((o) => o.textContent);
    expect(opts).toContain(":07");
    expect(opts).toHaveLength(13);
    expect((within(dialog()).getByLabelText("Minute") as HTMLSelectElement).value).toBe("7");
    expect(props.onChange).not.toHaveBeenCalled();
  });
});

describe("no future potties (#64)", () => {
  it("greys out later days in the calendar and stops at this month", () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    open("potty");
    fireEvent.click(dayBox());
    const pop = within(dialog());
    expect((pop.getByRole("button", { name: /November 17/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((pop.getByRole("button", { name: /November 18/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((pop.getByRole("button", { name: /November 30/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((pop.getByRole("button", { name: "Next month" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(pop.getByRole("button", { name: /November 18/ }));
    expect(dialog()).toBeTruthy(); // a disabled day picks nothing
  });

  it("greys out the hours, minutes and PM after now, today only", () => {
    clockAt(new Date(2026, 10, 17, 14, 38)); // 2:38 PM
    open("potty");
    fireEvent.click(timeBox());
    const pop = within(dialog());
    const hour = pop.getByLabelText("Hour") as HTMLSelectElement;
    const off = (sel: HTMLSelectElement) => Array.from(sel.options).filter((o) => o.disabled).map((o) => o.textContent);
    expect(off(hour)).toEqual(["3", "4", "5", "6", "7", "8", "9", "10", "11"]); // 3 PM and on
    fireEvent.change(hour, { target: { value: "2" } });
    expect(off(pop.getByLabelText("Minute") as HTMLSelectElement)).toEqual([":40", ":45", ":50", ":55"]);
    expect(off(pop.getByLabelText("AM or PM") as HTMLSelectElement)).toEqual([]);
    // Another day back: nothing is greyed out.
    fireEvent.click(pop.getByRole("button", { name: "Cancel" }));
    pickDay("2026-11-16");
    fireEvent.click(timeBox());
    expect(off(within(dialog()).getByLabelText("Hour") as HTMLSelectElement)).toEqual([]);
  });

  it("PM is greyed out before noon", () => {
    clockAt(new Date(2026, 10, 17, 9, 12));
    open("potty");
    fireEvent.click(timeBox());
    const ap = within(dialog()).getByLabelText("AM or PM") as HTMLSelectElement;
    expect(Array.from(ap.options).filter((o) => o.disabled).map((o) => o.textContent)).toEqual(["PM"]);
  });

  it("an hour that would put the minutes past now brings them back to now", () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    open("potty");
    pickTime(1, 55, true); // 1:55 PM is past
    expect(timeBox().textContent).toContain("1:55 PM");
    pickTime(2, 55, true); // 2:55 PM is after now
    expect(timeBox().textContent).toContain("2:35 PM");
  });

  it("picking today from an evening on another day never lands after now", () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    open("potty");
    pickDay("2026-11-16");
    pickTime(11, 55, true);
    pickDay("2026-11-17");
    expect(timeBox().textContent).toContain("2:35 PM");
  });

  it("has no Repeat, and Now and the shortcuts are all at or before now", () => {
    open("potty");
    expect(screen.queryByText("Repeat")).toBeNull();
    expect(document.querySelector('[data-section="plan"]')).toBeNull();
  });

  it("an open Potty plan from before can still be edited on its own day", () => {
    const plan = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      kind: "other",
      title: "Potty",
      due_on: toDateInput(new Date(Date.now() + 5 * 86400_000).toISOString()),
      due_time: "09:30",
      note: null,
      repeat_every: null,
      repeat_unit: null,
      done_event: null,
      cancelled_at: null,
      created_at: new Date().toISOString(),
    };
    open("potty", { plan });
    expect(timeBox().textContent).toContain("9:30 AM");
    expect(dayBox().getAttribute("aria-label")).not.toContain("Today");
  });
});

describe("Repeat is always on the form (#64)", () => {
  const forms: [FormKind, Record<string, unknown>][] = [
    ["food", {}],
    ["fun", {}],
    ["training", {}],
    ["weight", {}],
    ["health", { healthType: "vet" }],
  ];

  it("shows on every form but Potty at opening, with its boxes dimmed until it is ticked", () => {
    for (const [form, extra] of forms) {
      cleanup();
      open(form, extra);
      expect(screen.getByText("Repeat"), form).toBeTruthy();
      const every = screen.getByLabelText("Repeat every") as HTMLInputElement;
      const unit = screen.getByLabelText("Repeat unit") as HTMLSelectElement;
      expect(every.disabled && unit.disabled, form).toBe(true);
      fireEvent.click(screen.getByLabelText("Repeat"));
      expect(every.disabled || unit.disabled, form).toBe(false);
    }
  });

  it("does not move when the time turns future: the same Repeat block, and no notice line", () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    open("food");
    const before = document.querySelector('[data-section="plan"]') as HTMLElement;
    const html = before.outerHTML;
    pickDay("2026-11-24");
    expect(document.querySelector('[data-section="plan"]')).toBe(before);
    expect(before.outerHTML).toBe(html);
    expect(screen.queryByText("Future: saves as upcoming")).toBeNull();
    expect(screen.getByRole("button", { name: "Save plan" })).toBeTruthy();
  });

  it("with a later time, ticked, saves a recurring plan starting then", async () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    const props = open("training");
    pickDay("2026-11-24");
    pickTime(9, 30, false);
    fireEvent.click(screen.getByLabelText("Repeat"));
    fireEvent.change(screen.getByLabelText("Repeat every"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Repeat unit"), { target: { value: "month" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(props.onUpcoming).toHaveBeenCalledTimes(1));
    expect(props.onUpcoming.mock.calls[0][0]).toMatchObject({ due_on: "2026-11-24", due_time: "09:30", repeat_every: 2, repeat_unit: "month" });
    expect(props.onLog).not.toHaveBeenCalled();
  });

  it("ticked on a time that is now or past is refused with a clear message, and nothing is saved", () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    for (const [form, extra] of forms) {
      cleanup();
      const props = open(form, extra);
      if (form === "weight") fireEvent.change(screen.getByLabelText(/Weight/, { selector: "input" }), { target: { value: "7.3" } });
      if (form === "health") fireEvent.change(screen.getByPlaceholderText("What happened?"), { target: { value: "Invented words" } });
      fireEvent.click(screen.getByLabelText("Repeat"));
      fireEvent.click(saveButton());
      expect(screen.getByRole("alert").textContent, form).toBe(REPEAT_NEEDS_FUTURE);
      expect(props.onLog, form).not.toHaveBeenCalled();
      expect(props.onUpcoming, form).not.toHaveBeenCalled();
      // Unticking it saves the entry as usual.
      fireEvent.click(screen.getByLabelText("Repeat"));
      fireEvent.click(saveButton());
      // (A vet visit has its own required pick, which is not Repeat's business.)
      if (form === "health") expect(screen.getByRole("alert").textContent).toMatch(/why you went to the vet/);
      else expect(props.onLog, form).toHaveBeenCalledTimes(1);
    }
  });

  it("ticked on a past time is refused too", () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    const props = open("training");
    pickDay("2026-11-10");
    fireEvent.click(screen.getByLabelText("Repeat"));
    fireEvent.click(saveButton());
    expect(screen.getByRole("alert").textContent).toBe(REPEAT_NEEDS_FUTURE);
    expect(props.onLog).not.toHaveBeenCalled();
  });

  it("an open plan keeps its repeat when edited, even on a day that has passed", async () => {
    const plan = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      kind: "other",
      title: "Training",
      due_on: "2020-01-06",
      due_time: "09:30",
      note: null,
      repeat_every: 1,
      repeat_unit: "week",
      done_event: null,
      cancelled_at: null,
      created_at: "2020-01-01T00:00:00.000Z",
    };
    const props = open("training", { plan });
    expect((screen.getByLabelText("Repeat") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(props.onUpcoming).toHaveBeenCalledTimes(1));
    expect(props.onUpcoming.mock.calls[0][0]).toMatchObject({ due_on: "2020-01-06", repeat_every: 1, repeat_unit: "week" });
  });
});

describe("Save (#64)", () => {
  it("one tap logs at now on every form, and nothing opens after Save", () => {
    for (const form of ["potty", "food", "fun", "training", "weight"] as FormKind[]) {
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

  it("an earlier day and time is logged at that time", () => {
    const props = open("potty");
    pickPee();
    const earlier = withDay(hoursFromNow(-3), toDateInput(new Date(Date.now() - 26 * 3600_000).toISOString()));
    setWhen(earlier);
    fireEvent.click(saveButton());
    const [body] = props.onLog.mock.calls[0] as unknown as [{ at: string }];
    expect(toLocalInput(body.at)).toBe(earlier);
    expect(props.onUpcoming).not.toHaveBeenCalled();
  });

  it("a form's own mistake is shown on the form and the time stays", () => {
    open("potty");
    const earlier = hoursFromNow(-2);
    setWhen(earlier);
    fireEvent.click(saveButton());
    expect(screen.getByRole("alert").textContent).toMatch(/Pick what happened/);
    const c = clock12(earlier);
    expect(timeBox().textContent).toContain(`${c.hour}:${String(c.minute).padStart(2, "0")} ${c.pm ? "PM" : "AM"}`);
    noDialog();
  });
});

describe("a future time (#64)", () => {
  const later = () => withClock(withDay(nowLocal(), toDateInput(new Date(Date.now() + 2 * 86400_000).toISOString())), { hour: 9, minute: 30, pm: false });

  it("Save reads Save plan, and one tap saves an upcoming item, not an entry", async () => {
    const props = open("training");
    const at = later();
    setWhen(at);
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(props.onUpcoming).toHaveBeenCalledTimes(1));
    expect(props.onLog).not.toHaveBeenCalled();
    expect(props.onUpcoming.mock.calls[0][0]).toMatchObject({ due_on: at.slice(0, 10), due_time: "09:30" });
    noDialog();
  });

  it("a failed save keeps the chosen time: Save reads Retry, and Retry saves the same plan", async () => {
    const onUpcoming = vi.fn().mockResolvedValueOnce({ error: "Could not save" }).mockResolvedValueOnce({ error: null });
    open("training", { onUpcoming });
    const at = later();
    setWhen(at);
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Could not save"));
    expect(timeBox().textContent).toContain("9:30 AM");
    noDialog();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onUpcoming).toHaveBeenCalledTimes(2));
    expect(onUpcoming.mock.calls[1][0]).toMatchObject({ due_on: at.slice(0, 10), due_time: "09:30" });
  });

  it("Weight in the future is a plan on that day", async () => {
    const props = open("weight");
    fireEvent.change(screen.getByLabelText(/Weight/, { selector: "input" }), { target: { value: "7.3" } });
    const day = toDateInput(new Date(Date.now() + 3 * 86400_000).toISOString());
    pickDay(day);
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(props.onUpcoming).toHaveBeenCalledTimes(1));
    expect(props.onUpcoming.mock.calls[0][0]).toMatchObject({ due_on: day });
    expect(props.onLog).not.toHaveBeenCalled();
  });
});

describe("a form that opens on a time of its own (#64)", () => {
  it("a correction opens on the entry's stored time, and untouched leaves the time to the millisecond", async () => {
    const at = "2026-10-19T21:05:07.123Z";
    const event = stored(at);
    const props = open("potty", { event });
    const c = clock12(toLocalInput(at));
    expect(timeBox().textContent).toContain(`${c.hour}:${String(c.minute).padStart(2, "0")} ${c.pm ? "PM" : "AM"}`);
    fireEvent.click(saveButton());
    await waitFor(() => expect(props.onChange).toHaveBeenCalledTimes(1));
    expect(props.onChange.mock.calls[0][0]).toMatchObject({ at, voids: event.id });
    noDialog();
  });

  it("a correction moved to another time saves that time", async () => {
    const props = open("potty", { event: stored("2026-10-19T21:05:07.123Z") });
    const other = hoursFromNow(-30);
    setWhen(other);
    fireEvent.click(saveButton());
    await waitFor(() => expect(props.onChange).toHaveBeenCalledTimes(1));
    expect(toLocalInput((props.onChange.mock.calls[0][0] as { at: string }).at)).toBe(other);
  });

  it("a correction of a Training can't move to the future", () => {
    const training = { ...stored("2026-10-19T21:05:07.123Z"), kind: "exercise", details: { type: "training", where: "outside", minutes: 15, treats: 0, commands: [] } } as unknown as JournalEvent;
    const props = open("training", { event: training });
    pickDay(toDateInput(new Date(Date.now() + 3 * 86400_000).toISOString()));
    fireEvent.click(saveButton());
    expect(screen.getByRole("alert").textContent).toMatch(/can't move to the future/);
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onUpcoming).not.toHaveBeenCalled();
  });

  it("a Potty correction can't be moved to the future at all: the day and time are greyed out", () => {
    open("potty", { event: stored("2026-10-19T21:05:07.123Z") });
    fireEvent.click(dayBox());
    // The entry is from October 2026: the calendar pages on to this month and no further.
    for (let i = 0; i < 60 && !(within(dialog()).getByRole("button", { name: "Next month" }) as HTMLButtonElement).disabled; i++) {
      fireEvent.click(within(dialog()).getByRole("button", { name: "Next month" }));
    }
    const today = new Date();
    expect(within(dialog()).getByText(today.toLocaleDateString(undefined, { month: "long", year: "numeric" }))).toBeTruthy();
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

describe("the Note form's Day and Time (#64)", () => {
  const write = () => fireEvent.change(screen.getByPlaceholderText("Write the note"), { target: { value: "Invented words" } });

  it("has Day, Time, Logging as and Save in two equal columns, and one tap on Save logs the note", () => {
    const props = noteProps();
    render(createElement(NoteForm, props));
    const block = document.querySelector('[data-section="when-who"]') as HTMLElement;
    expect(block.className).toContain("grid-cols-2");
    for (const el of [dayBox(), timeBox(), screen.getByLabelText("Logging as"), screen.getByRole("button", { name: "Save note" })]) expect(block.contains(el)).toBe(true);
    write();
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(props.onLog).toHaveBeenCalledTimes(1);
    noDialog();
  });

  it("never offers a later day or time, and has no Repeat", () => {
    clockAt(new Date(2026, 10, 17, 14, 38));
    render(createElement(NoteForm, noteProps()));
    expect(screen.queryByText("Repeat")).toBeNull();
    fireEvent.click(dayBox());
    expect((within(dialog()).getByRole("button", { name: /November 18/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    fireEvent.click(timeBox());
    const hour = within(dialog()).getByLabelText("Hour") as HTMLSelectElement;
    expect(Array.from(hour.options).filter((o) => o.disabled)).toHaveLength(9);
  });

  it("logs a past time picked in the pop-ups", () => {
    const props = noteProps();
    render(createElement(NoteForm, props));
    write();
    const earlier = hoursFromNow(-5);
    setWhen(earlier);
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    const [body] = props.onLog.mock.calls[0] as unknown as [{ at: string }];
    expect(toLocalInput(body.at)).toBe(earlier);
  });
});
