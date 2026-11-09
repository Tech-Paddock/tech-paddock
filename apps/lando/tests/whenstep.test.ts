// @vitest-environment jsdom
// TEC-258 (after TEC-255, TEC-252): Save always opens a small When sheet (native date-and-time field and a Save); the form has no When. Rendered in a DOM so the taps are real.
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
/** The sheet's native field, and what it holds. */
const sheetField = () => within(sheet()!).getByLabelText(/^Date/) as HTMLInputElement;
/** Sets the sheet's field to a value and taps its Save, as a person does. */
const pick = (value: string) => {
  fireEvent.change(sheetField(), { target: { value } });
  fireEvent.click(within(sheet()!).getByRole("button", { name: "Save" }));
};
/** Taps the sheet's Save on whatever it opened on. */
const saveSheet = () => fireEvent.click(within(sheet()!).getByRole("button", { name: "Save" }));

afterEach(() => cleanup());

const repeatStep = () => screen.queryByRole("dialog", { name: "Repeat?" });
/** Confirms the small Repeat step a future pick opens. */
const confirmPlan = () => fireEvent.click(within(repeatStep()!).getByRole("button", { name: "Save as upcoming" }));
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

describe("Save always opens the When sheet (TEC-258)", () => {
  it("has no When on the form, no Now, and Logging as is beside Save", () => {
    open("potty");
    expect(screen.queryByLabelText("When")).toBeNull();
    expect(screen.queryByRole("button", { name: "Now" })).toBeNull();
    const who = screen.getByLabelText("Logging as");
    expect(who.parentElement).toBe(saveButton().parentElement);
  });

  it("opens the sheet on every form, from Save, and saves nothing until its Save is tapped", () => {
    const forms: [FormKind, Record<string, unknown>][] = [
      ["potty", {}],
      ["food", {}],
      ["fun", {}],
      ["training", {}],
      ["weight", { weightUnit: "lb" }],
    ];
    for (const [form] of forms) {
      cleanup();
      const props = open(form);
      if (form === "potty") pickPee();
      if (form === "weight") fireEvent.change(screen.getByLabelText(/Weight/, { selector: "input" }), { target: { value: "7.3" } });
      fireEvent.click(saveButton());
      expect(sheet(), form).not.toBeNull();
      expect(props.onLog, form).not.toHaveBeenCalled();
    }
  });

  it("a new entry opens it on now, and its Save logs the moment of the save", () => {
    const props = open("potty");
    pickPee();
    fireEvent.click(saveButton());
    expect(sheetField().value).toBe(nowLocal());
    saveSheet();
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

  it("a future time asks its Repeat first and saves nothing until it is confirmed", async () => {
    const props = open("potty");
    pickPee();
    fireEvent.click(saveButton());
    const later = hoursFromNow(26);
    pick(later);
    expect(repeatStep()).not.toBeNull();
    expect(within(repeatStep()!).getByText("Future: saves as upcoming")).toBeTruthy();
    expect(within(repeatStep()!).getByText("Repeat")).toBeTruthy();
    expect(props.onUpcoming).not.toHaveBeenCalled();
    expect(props.onLog).not.toHaveBeenCalled();
    confirmPlan();
    expect(repeatStep()).toBeNull();
    await waitFor(() => expect(props.onUpcoming).toHaveBeenCalledTimes(1));
    expect(props.onLog).not.toHaveBeenCalled();
    expect(props.onUpcoming.mock.calls[0][0]).toMatchObject({ due_on: later.slice(0, 10), due_time: later.slice(11, 16) });
  });

  it("a future time with Repeat ticked saves a plan with the chosen repeat", async () => {
    const props = open("potty");
    pickPee();
    fireEvent.click(saveButton());
    pick(hoursFromNow(26));
    fireEvent.click(within(repeatStep()!).getByLabelText("Repeat"));
    fireEvent.change(within(repeatStep()!).getByLabelText("Repeat every"), { target: { value: "2" } });
    fireEvent.change(within(repeatStep()!).getByLabelText("Repeat unit"), { target: { value: "month" } });
    confirmPlan();
    await waitFor(() => expect(props.onUpcoming).toHaveBeenCalledTimes(1));
    expect(props.onUpcoming.mock.calls[0][0]).toMatchObject({ repeat_every: 2, repeat_unit: "month" });
    expect(props.onLog).not.toHaveBeenCalled();
  });

  it("Back to the form on the Repeat step saves nothing, and Save asks the time again", () => {
    const props = open("potty");
    pickPee();
    fireEvent.click(saveButton());
    pick(hoursFromNow(26));
    fireEvent.click(within(repeatStep()!).getByRole("button", { name: "Back to the form" }));
    expect(repeatStep()).toBeNull();
    expect(props.onUpcoming).not.toHaveBeenCalled();
    fireEvent.click(saveButton());
    expect(sheet()).not.toBeNull();
  });

  it("a past time or now saves at once, with no Repeat step", () => {
    const props = open("potty");
    pickPee();
    fireEvent.click(saveButton());
    pick(hoursFromNow(-2));
    expect(repeatStep()).toBeNull();
    expect(props.onLog).toHaveBeenCalledTimes(1);
  });

  it("a failed save keeps the picked time: Save reads Retry and does not open the picker again", async () => {
    const onUpcoming = vi.fn().mockResolvedValueOnce({ error: "Could not save" }).mockResolvedValueOnce({ error: null });
    open("potty", { onUpcoming });
    pickPee();
    fireEvent.click(saveButton());
    const later = hoursFromNow(26);
    pick(later);
    confirmPlan();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Could not save"));
    expect(sheet()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onUpcoming).toHaveBeenCalledTimes(2));
    expect(sheet()).toBeNull();
    expect(repeatStep()).toBeNull();
    expect(onUpcoming.mock.calls[1][0]).toMatchObject({ due_on: later.slice(0, 10), due_time: later.slice(11, 16) });
  });

  it("after a failure a person can pick another time", async () => {
    const onUpcoming = vi.fn().mockResolvedValue({ error: "Could not save" });
    open("potty", { onUpcoming });
    pickPee();
    fireEvent.click(saveButton());
    pick(hoursFromNow(26));
    confirmPlan();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Pick another time" }));
    fireEvent.click(saveButton());
    expect(sheet()).not.toBeNull();
  });

  it("a form's own mistake is shown on the form, and Save asks the time again", () => {
    open("potty");
    fireEvent.click(saveButton());
    saveSheet();
    expect(screen.getByRole("alert").textContent).toMatch(/Pick what happened/);
    pickPee();
    fireEvent.click(saveButton());
    expect(sheet()).not.toBeNull();
  });

  it("Weight opens a date field in the sheet, on today", () => {
    const props = open("weight");
    fireEvent.change(screen.getByLabelText(/Weight/, { selector: "input" }), { target: { value: "7.3" } });
    fireEvent.click(saveButton());
    expect(sheetField().type).toBe("date");
    expect(sheetField().value).toBe(toLocalInput(new Date().toISOString()).slice(0, 10));
    expect(props.onLog).not.toHaveBeenCalled();
    pick(toLocalInput(new Date().toISOString()).slice(0, 10));
    expect(props.onLog).toHaveBeenCalledTimes(1);
  });

  it("a correction opens on the entry's stored time, and handing it back leaves the time to the millisecond", async () => {
    const at = "2026-10-19T21:05:07.123Z";
    const event = stored(at);
    const props = open("potty", { event });
    fireEvent.click(saveButton());
    expect(sheetField().value).toBe(toLocalInput(at));
    expect(props.onChange).not.toHaveBeenCalled();
    saveSheet();
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
    fireEvent.change(sheetField(), { target: { value: hoursFromNow(26) } });
    // The sheet says why and its Save is off, so nothing is sent.
    expect(within(sheet()!).getByRole("status").textContent).toMatch(/can't move to the future/);
    expect((within(sheet()!).getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onUpcoming).not.toHaveBeenCalled();
  });

  it("the Calendar's Add a plan opens the sheet on that day, as a plan", async () => {
    const day = toLocalInput(new Date(Date.now() + 3 * 86400_000).toISOString()).slice(0, 10);
    const props = open("training", { planDay: day });
    expect(screen.getByText("Future: saves as upcoming")).toBeTruthy();
    expect(screen.getByText("Repeat")).toBeTruthy();
    fireEvent.click(saveButton());
    expect(sheetField().value.slice(0, 10)).toBe(day);
    saveSheet();
    await waitFor(() => expect(props.onUpcoming).toHaveBeenCalledTimes(1));
    expect(props.onUpcoming.mock.calls[0][0]).toMatchObject({ due_on: day });
    expect(props.onLog).not.toHaveBeenCalled();
  });
});

describe("the When sheet (TEC-258)", () => {
  it("holds the native field, and its Save logs the time", () => {
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

  it("Back to the form saves nothing", () => {
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

describe("the Note form's sheet (TEC-258)", () => {
  const noteProps = () => ({
    people: [{ id: PERSON, display_name: "Tester" }],
    phonePerson: PERSON,
    photoUrls: {},
    onPhotoUrl: () => {},
    onLog: vi.fn<(...a: unknown[]) => void>(),
    onChange: vi.fn<(...a: unknown[]) => Promise<{ error: string | null }>>(async () => ({ error: null })),
  });
  const write = () => fireEvent.change(screen.getByPlaceholderText("Write the note"), { target: { value: "Invented words" } });

  it("has no When on the form; Save opens the sheet and its Save logs the note", () => {
    const props = noteProps();
    render(createElement(NoteForm, props));
    expect(screen.queryByLabelText("When")).toBeNull();
    write();
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(sheet()).not.toBeNull();
    expect(props.onLog).not.toHaveBeenCalled();
    saveSheet();
    expect(props.onLog).toHaveBeenCalledTimes(1);
  });

  it("refuses a future time", () => {
    const props = noteProps();
    render(createElement(NoteForm, props));
    write();
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    fireEvent.change(sheetField(), { target: { value: hoursFromNow(26) } });
    expect(within(sheet()!).getByRole("status").textContent).toMatch(/future/i);
    expect((within(sheet()!).getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    expect(props.onLog).not.toHaveBeenCalled();
    expect(screen.queryByText("Repeat")).toBeNull();
  });
});
