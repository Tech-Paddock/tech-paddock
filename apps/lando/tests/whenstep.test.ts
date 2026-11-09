// @vitest-environment jsdom
// TEC-255 (after TEC-252): Save opens the phone's own date-and-time picker; the form has no When and no When step. Rendered in a DOM so the taps are real.
// jsdom has no picker, so `showPicker` is stubbed where a test needs the real path; without it the fallback sheet shows.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import LogForm from "@/app/LogForm";
import NoteForm from "@/app/NoteForm";
import type { FormKind, JournalEvent } from "@/lib/events";
import { toLocalInput } from "@/lib/localtime";

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


const saveButton = () => screen.getByRole("button", { name: /^Save (?!changes$)|^Save changes$|^Save as upcoming$|^Retry$/ });
const sheet = () => screen.queryByRole("dialog", { name: "When?" });
const pickPee = () => fireEvent.click(screen.getByLabelText("Pee"));
/** The hidden field the picker opens on. */
const field = () => document.querySelector<HTMLInputElement>("input[data-when-picker]")!;
/** Confirms the picker with a value, as the phone does. */
const pick = (value: string) => fireEvent.change(field(), { target: { value } });

let showPicker: ReturnType<typeof vi.fn>;
/** What the picker was opened on (`field().value` at the call), one entry per opening. */
let openedOn: string[];
beforeEach(() => {
  openedOn = [];
  showPicker = vi.fn(function (this: HTMLInputElement) {
    openedOn.push(this.value);
  });
  (HTMLInputElement.prototype as unknown as { showPicker: unknown }).showPicker = showPicker;
});
afterEach(() => {
  cleanup();
  delete (HTMLInputElement.prototype as unknown as { showPicker?: unknown }).showPicker;
});

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

describe("Save opens the phone's own picker (TEC-255)", () => {
  it("has no When on the form, no Now, and Logging as is beside Save", () => {
    open("potty");
    expect(screen.queryByLabelText("When")).toBeNull();
    expect(screen.queryByRole("button", { name: "Now" })).toBeNull();
    const who = screen.getByLabelText("Logging as");
    expect(who.parentElement).toBe(saveButton().parentElement);
  });

  it("opens the picker on every form, from Save, and saves nothing until it is confirmed", () => {
    const forms: [FormKind, Record<string, unknown>][] = [
      ["potty", {}],
      ["food", {}],
      ["fun", {}],
      ["training", {}],
      ["weight", { weightUnit: "lb" }],
    ];
    for (const [form] of forms) {
      cleanup();
      showPicker.mockClear();
      const props = open(form);
      if (form === "potty") pickPee();
      if (form === "weight") fireEvent.change(screen.getByLabelText(/Weight/, { selector: "input" }), { target: { value: "7.3" } });
      fireEvent.click(saveButton());
      expect(showPicker, form).toHaveBeenCalledTimes(1);
      expect(sheet(), form).toBeNull();
      expect(props.onLog, form).not.toHaveBeenCalled();
    }
  });

  it("a new entry opens it empty (the phone fills in now), and confirming now logs the moment of the save", () => {
    const props = open("potty");
    pickPee();
    fireEvent.click(saveButton());
    expect(openedOn).toEqual([""]);
    pick(nowLocal());
    expect(props.onLog).toHaveBeenCalledTimes(1);
    const [body] = props.onLog.mock.calls[0] as unknown as [{ at: string; kind: string; person_id: string }];
    expect(body.kind).toBe("potty");
    expect(body.person_id).toBe(PERSON);
    expect(Math.abs(Date.now() - Date.parse(body.at))).toBeLessThan(5000);
    expect(props.onUpcoming).not.toHaveBeenCalled();
  });

  it("an earlier time is logged at that time", () => {
    const props = open("potty");
    pickPee();
    fireEvent.click(saveButton());
    const earlier = hoursFromNow(-3);
    pick(earlier);
    const [body] = props.onLog.mock.calls[0] as unknown as [{ at: string }];
    expect(toLocalInput(body.at)).toBe(earlier);
    expect(props.onUpcoming).not.toHaveBeenCalled();
  });

  it("a future time makes a plan, never an entry", async () => {
    const props = open("potty");
    pickPee();
    fireEvent.click(saveButton());
    const later = hoursFromNow(26);
    pick(later);
    await waitFor(() => expect(props.onUpcoming).toHaveBeenCalledTimes(1));
    expect(props.onLog).not.toHaveBeenCalled();
    expect(props.onUpcoming.mock.calls[0][0]).toMatchObject({ due_on: later.slice(0, 10), due_time: later.slice(11, 16) });
  });

  it("a failed save keeps the picked time: Save reads Retry and does not open the picker again", async () => {
    const onUpcoming = vi.fn().mockResolvedValueOnce({ error: "Could not save" }).mockResolvedValueOnce({ error: null });
    open("potty", { onUpcoming });
    pickPee();
    fireEvent.click(saveButton());
    const later = hoursFromNow(26);
    pick(later);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Could not save"));
    expect(showPicker).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onUpcoming).toHaveBeenCalledTimes(2));
    expect(showPicker).toHaveBeenCalledTimes(1);
    expect(onUpcoming.mock.calls[1][0]).toMatchObject({ due_on: later.slice(0, 10), due_time: later.slice(11, 16) });
  });

  it("after a failure a person can pick another time", async () => {
    const onUpcoming = vi.fn().mockResolvedValue({ error: "Could not save" });
    open("potty", { onUpcoming });
    pickPee();
    fireEvent.click(saveButton());
    pick(hoursFromNow(26));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Pick another time" }));
    fireEvent.click(saveButton());
    expect(showPicker).toHaveBeenCalledTimes(2);
  });

  it("a form's own mistake is shown on the form, and Save asks the time again", () => {
    open("potty");
    fireEvent.click(saveButton());
    pick(nowLocal());
    expect(screen.getByRole("alert").textContent).toMatch(/Pick what happened/);
    pickPee();
    fireEvent.click(saveButton());
    expect(showPicker).toHaveBeenCalledTimes(2);
  });

  it("Weight opens a date picker, on today", () => {
    const props = open("weight");
    fireEvent.change(screen.getByLabelText(/Weight/, { selector: "input" }), { target: { value: "7.3" } });
    fireEvent.click(saveButton());
    expect(field().type).toBe("date");
    expect(props.onLog).not.toHaveBeenCalled();
    pick(toLocalInput(new Date().toISOString()).slice(0, 10));
    expect(props.onLog).toHaveBeenCalledTimes(1);
  });

  it("a correction opens on the entry's stored time, and handing it back leaves the time to the millisecond", async () => {
    const at = "2026-10-19T21:05:07.123Z";
    const event = stored(at);
    const props = open("potty", { event });
    fireEvent.click(saveButton());
    expect(openedOn).toEqual([toLocalInput(at)]);
    // The phone reports no change when a time is confirmed as it was, so the sheet beside the picker has the button.
    expect(props.onChange).not.toHaveBeenCalled();
    fireEvent.click(within(sheet()!).getByRole("button", { name: "Use this time" }));
    await waitFor(() => expect(props.onChange).toHaveBeenCalledTimes(1));
    expect(props.onChange.mock.calls[0][0]).toMatchObject({ at, voids: event.id });
  });

  it("a correction moved to another time saves that time", async () => {
    const props = open("potty", { event: stored("2026-10-19T21:05:07.123Z") });
    fireEvent.click(saveButton());
    const other = hoursFromNow(-30);
    pick(other);
    expect(sheet()).toBeNull();
    await waitFor(() => expect(props.onChange).toHaveBeenCalledTimes(1));
    expect(toLocalInput((props.onChange.mock.calls[0][0] as { at: string }).at)).toBe(other);
  });

  it("a correction cannot be moved to the future", async () => {
    const props = open("potty", { event: stored("2026-10-19T21:05:07.123Z") });
    fireEvent.click(saveButton());
    pick(hoursFromNow(26));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/can't move to the future/));
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onUpcoming).not.toHaveBeenCalled();
  });

  it("the Calendar's Add a plan opens the picker on that day, as a plan", async () => {
    const day = toLocalInput(new Date(Date.now() + 3 * 86400_000).toISOString()).slice(0, 10);
    const props = open("training", { planDay: day });
    expect(screen.getByText("Future: saves as upcoming")).toBeTruthy();
    expect(screen.getByText("Repeat")).toBeTruthy();
    fireEvent.click(saveButton());
    expect(openedOn).toHaveLength(1);
    expect(openedOn[0].slice(0, 10)).toBe(day);
    fireEvent.click(within(sheet()!).getByRole("button", { name: "Use this time" }));
    await waitFor(() => expect(props.onUpcoming).toHaveBeenCalledTimes(1));
    expect(props.onUpcoming.mock.calls[0][0]).toMatchObject({ due_on: day });
    expect(props.onLog).not.toHaveBeenCalled();
  });

  it("a form of its own has no When step: no sheet, even where the browser refuses showPicker's field", () => {
    open("potty");
    pickPee();
    fireEvent.click(saveButton());
    expect(sheet()).toBeNull();
  });
});

describe("when the browser refuses showPicker (TEC-255)", () => {
  beforeEach(() => {
    showPicker.mockImplementation(() => {
      throw new DOMException("not allowed", "NotAllowedError");
    });
  });

  it("a small sheet holds the native field, and its Save logs the time", () => {
    const props = open("potty");
    pickPee();
    fireEvent.click(saveButton());
    const s = sheet()!;
    expect(s).not.toBeNull();
    expect(within(s).queryByRole("button", { name: "Now" })).toBeNull();
    const earlier = hoursFromNow(-2);
    fireEvent.change(within(s).getByLabelText("Date and time"), { target: { value: earlier } });
    expect(props.onLog).not.toHaveBeenCalled();
    fireEvent.click(within(s).getByRole("button", { name: "Save" }));
    expect(sheet()).toBeNull();
    const [body] = props.onLog.mock.calls[0] as unknown as [{ at: string }];
    expect(toLocalInput(body.at)).toBe(earlier);
  });

  it("is the same without showPicker at all, and Back to the form saves nothing", () => {
    delete (HTMLInputElement.prototype as unknown as { showPicker?: unknown }).showPicker;
    const props = open("potty");
    pickPee();
    fireEvent.click(saveButton());
    fireEvent.click(within(sheet()!).getByRole("button", { name: "Back to the form" }));
    expect(sheet()).toBeNull();
    expect(props.onLog).not.toHaveBeenCalled();
  });

  it("a future time in the sheet says so", () => {
    open("potty");
    pickPee();
    fireEvent.click(saveButton());
    fireEvent.change(within(sheet()!).getByLabelText("Date and time"), { target: { value: hoursFromNow(26) } });
    expect(within(sheet()!).getByText("Future: saves as upcoming")).toBeTruthy();
  });
});

describe("the Note form's picker (TEC-255)", () => {
  const noteProps = () => ({
    people: [{ id: PERSON, display_name: "Tester" }],
    phonePerson: PERSON,
    photoUrls: {},
    onPhotoUrl: () => {},
    onLog: vi.fn<(...a: unknown[]) => void>(),
    onChange: vi.fn<(...a: unknown[]) => Promise<{ error: string | null }>>(async () => ({ error: null })),
  });
  const write = () => fireEvent.change(screen.getByPlaceholderText("Write the note"), { target: { value: "Invented words" } });

  it("has no When on the form; Save opens the picker and confirming logs the note", () => {
    const props = noteProps();
    render(createElement(NoteForm, props));
    expect(screen.queryByLabelText("When")).toBeNull();
    write();
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(showPicker).toHaveBeenCalledTimes(1);
    expect(props.onLog).not.toHaveBeenCalled();
    pick(nowLocal());
    expect(props.onLog).toHaveBeenCalledTimes(1);
  });

  it("refuses a future time", () => {
    const props = noteProps();
    render(createElement(NoteForm, props));
    write();
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    pick(hoursFromNow(26));
    expect(screen.getByRole("alert").textContent).toMatch(/future/i);
    expect(props.onLog).not.toHaveBeenCalled();
    expect(screen.queryByText("Repeat")).toBeNull();
  });
});
