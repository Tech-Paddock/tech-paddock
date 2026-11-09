// @vitest-environment jsdom
// TEC-252: Save opens the When step over the form; the form has no When of its own. Rendered in a DOM so the taps are real.
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

const saveButton = () => screen.getByRole("button", { name: /^Save (?!changes$)|^Save changes$|^Save as upcoming$/ });
const step = () => screen.queryByRole("dialog", { name: "When?" });
const pickPee = () => fireEvent.click(screen.getByLabelText("Pee"));

afterEach(cleanup);

describe("Save opens the When step (TEC-252)", () => {
  it("has no When on the form, and Logging as is beside Save", () => {
    open("potty");
    expect(screen.queryByLabelText("When")).toBeNull();
    const who = screen.getByLabelText("Logging as");
    expect(who.parentElement).toBe(saveButton().parentElement);
  });

  it("opens on a big Now that is focused; saving nothing until it is tapped", () => {
    const props = open("potty");
    pickPee();
    fireEvent.click(saveButton());
    expect(step()).not.toBeNull();
    const now = within(step()!).getByRole("button", { name: "Now" });
    expect(document.activeElement).toBe(now);
    expect(props.onLog).not.toHaveBeenCalled();
    fireEvent.click(now);
    expect(props.onLog).toHaveBeenCalledTimes(1);
    const [body] = props.onLog.mock.calls[0] as unknown as [{ at: string; kind: string; person_id: string }];
    expect(body.kind).toBe("potty");
    expect(body.person_id).toBe(PERSON);
    expect(Math.abs(Date.now() - Date.parse(body.at))).toBeLessThan(5000);
    expect(props.onUpcoming).not.toHaveBeenCalled();
  });

  it("Back to the form closes the step and saves nothing", () => {
    const props = open("potty");
    pickPee();
    fireEvent.click(saveButton());
    fireEvent.click(within(step()!).getByRole("button", { name: "Back to the form" }));
    expect(step()).toBeNull();
    expect(props.onLog).not.toHaveBeenCalled();
  });

  it("a form's own mistake is shown on the form, not in a step", () => {
    open("potty");
    fireEvent.click(saveButton());
    fireEvent.click(within(step()!).getByRole("button", { name: "Now" }));
    expect(step()).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/Pick what happened/);
  });

  it("an earlier time is logged at that time", () => {
    const props = open("potty");
    pickPee();
    fireEvent.click(saveButton());
    const earlier = toLocalInput(new Date(Date.now() - 3 * 3600_000).toISOString());
    fireEvent.change(within(step()!).getByLabelText("Date and time"), { target: { value: earlier } });
    expect(within(step()!).queryByText("Future: saves as upcoming")).toBeNull();
    fireEvent.click(within(step()!).getByRole("button", { name: "Save" }));
    const [body] = props.onLog.mock.calls[0] as unknown as [{ at: string }];
    expect(toLocalInput(body.at)).toBe(earlier);
    expect(props.onUpcoming).not.toHaveBeenCalled();
  });

  it("a future time says so, and makes a plan, never an entry", async () => {
    const props = open("potty");
    pickPee();
    fireEvent.click(saveButton());
    const later = toLocalInput(new Date(Date.now() + 26 * 3600_000).toISOString());
    fireEvent.change(within(step()!).getByLabelText("Date and time"), { target: { value: later } });
    expect(within(step()!).getByText("Future: saves as upcoming")).toBeTruthy();
    expect(within(step()!).getByText("Repeat")).toBeTruthy();
    fireEvent.click(within(step()!).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(props.onUpcoming).toHaveBeenCalledTimes(1));
    expect(props.onLog).not.toHaveBeenCalled();
    expect(props.onUpcoming.mock.calls[0][0]).toMatchObject({ due_on: later.slice(0, 10), due_time: later.slice(11, 16) });
  });

  it("a failed plan keeps the step open on the chosen time, and the retry does not ask again", async () => {
    const onUpcoming = vi.fn().mockResolvedValueOnce({ error: "Could not save" }).mockResolvedValueOnce({ error: null });
    open("potty", { onUpcoming });
    pickPee();
    fireEvent.click(saveButton());
    const later = toLocalInput(new Date(Date.now() + 26 * 3600_000).toISOString());
    fireEvent.change(within(step()!).getByLabelText("Date and time"), { target: { value: later } });
    fireEvent.click(within(step()!).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(within(step()!).getByRole("alert").textContent).toBe("Could not save"));
    expect((within(step()!).getByLabelText("Date and time") as HTMLInputElement).value).toBe(later);
    fireEvent.click(within(step()!).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onUpcoming).toHaveBeenCalledTimes(2));
    expect(onUpcoming.mock.calls[1][0]).toMatchObject({ due_on: later.slice(0, 10), due_time: later.slice(11, 16) });
  });

  it("Weight is a date: the step offers Today and a date", () => {
    const props = open("weight");
    fireEvent.change(screen.getByLabelText(/Weight/, { selector: "input" }), { target: { value: "7.3" } });
    fireEvent.click(saveButton());
    const s = step()!;
    expect(within(s).getByRole("button", { name: "Today" })).toBeTruthy();
    expect((within(s).getByLabelText("Date") as HTMLInputElement).type).toBe("date");
    expect(props.onLog).not.toHaveBeenCalled();
  });

  it("a correction opens the step on the entry's stored time, and keeping it leaves the time to the millisecond", async () => {
    const at = "2026-10-19T21:05:07.123Z";
    const event = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      kind: "potty",
      at,
      person_id: PERSON,
      details: { what: "pee", where: "outside" },
      note: null,
      voids: null,
      created_at: at,
    } as unknown as JournalEvent;
    const props = open("potty", { event });
    fireEvent.click(saveButton());
    const s = step()!;
    expect((within(s).getByLabelText("Date and time") as HTMLInputElement).value).toBe(toLocalInput(at));
    fireEvent.click(within(s).getByRole("button", { name: /^Keep / }));
    await waitFor(() => expect(props.onChange).toHaveBeenCalledTimes(1));
    expect(props.onChange.mock.calls[0][0]).toMatchObject({ at, voids: event.id });
  });

  it("a correction cannot be moved to the future in the step", () => {
    const event = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      kind: "potty",
      at: "2026-10-19T21:05:07.123Z",
      person_id: PERSON,
      details: { what: "pee", where: "outside" },
      note: null,
      voids: null,
      created_at: "2026-10-19T21:05:07.123Z",
    } as unknown as JournalEvent;
    open("potty", { event });
    fireEvent.click(saveButton());
    const later = toLocalInput(new Date(Date.now() + 26 * 3600_000).toISOString());
    fireEvent.change(within(step()!).getByLabelText("Date and time"), { target: { value: later } });
    expect(within(step()!).getByText("A saved entry can't move to the future.")).toBeTruthy();
    expect((within(step()!).getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the Calendar's Add a plan opens the step on that day, as a plan", async () => {
    const day = toLocalInput(new Date(Date.now() + 3 * 86400_000).toISOString()).slice(0, 10);
    const props = open("training", { planDay: day });
    fireEvent.click(saveButton());
    const s = step()!;
    expect((within(s).getByLabelText("Date and time") as HTMLInputElement).value.slice(0, 10)).toBe(day);
    expect(within(s).getByText("Future: saves as upcoming")).toBeTruthy();
    fireEvent.click(within(s).getByRole("button", { name: /^Use / }));
    await waitFor(() => expect(props.onUpcoming).toHaveBeenCalledTimes(1));
    expect(props.onUpcoming.mock.calls[0][0]).toMatchObject({ due_on: day });
    expect(props.onLog).not.toHaveBeenCalled();
  });
});

describe("the Note form's When step (TEC-252)", () => {
  const noteProps = () => ({
    people: [{ id: PERSON, display_name: "Tester" }],
    phonePerson: PERSON,
    photoUrls: {},
    onPhotoUrl: () => {},
    onLog: vi.fn<(...a: unknown[]) => void>(),
    onChange: vi.fn<(...a: unknown[]) => Promise<{ error: string | null }>>(async () => ({ error: null })),
  });

  it("has no When on the form; Save, then Now, logs the note", () => {
    const props = noteProps();
    render(createElement(NoteForm, props));
    expect(screen.queryByLabelText("When")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Write the note"), { target: { value: "Invented words" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    fireEvent.click(within(step()!).getByRole("button", { name: "Now" }));
    expect(props.onLog).toHaveBeenCalledTimes(1);
  });

  it("refuses a future time in the step", () => {
    const props = noteProps();
    render(createElement(NoteForm, props));
    fireEvent.change(screen.getByPlaceholderText("Write the note"), { target: { value: "Invented words" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    const later = toLocalInput(new Date(Date.now() + 26 * 3600_000).toISOString());
    fireEvent.change(within(step()!).getByLabelText("Date and time"), { target: { value: later } });
    expect((within(step()!).getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(step()!).queryByText("Repeat")).toBeNull();
  });
});
