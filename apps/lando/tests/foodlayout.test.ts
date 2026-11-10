// @vitest-environment jsdom
// TEC-263: a new Meal opens on 1 serving and a new Snuffle mat on a half, never a remembered amount; Servings sits left of
// What and is only as wide as its label, and What takes the rest of the row.
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import LogForm from "@/app/LogForm";
import type { JournalEvent } from "@/lib/events";

const PERSON = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const props = (extra: Record<string, unknown> = {}) => ({
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
  onLog: vi.fn(),
  onChange: async () => ({ error: null }),
  onUpcoming: async () => ({ error: null }),
  onPotty: () => {},
  unsaved: {},
  onRetry: () => {},
  ...extra,
});
const servings = () => screen.getByLabelText("Servings") as HTMLSelectElement;

afterEach(() => cleanup());

describe("Food defaults (TEC-263)", () => {
  it("a new Meal opens on 1 serving, even with a larger amount remembered from before", () => {
    render(createElement(LogForm, { ...props({ remembered: { meal: "misc", mealAmount: 3 } }), form: "food" } as never));
    expect(servings().value).toBe("1");
  });

  it("a new Snuffle mat opens on a half serving, and Meal goes back to 1", () => {
    render(createElement(LogForm, { ...props({ remembered: { mealAmount: 3 } }), form: "food" } as never));
    fireEvent.click(screen.getByLabelText("Snuffle mat"));
    expect(servings().value).toBe("0.5");
    fireEvent.click(screen.getByLabelText("Meal"));
    expect(servings().value).toBe("1");
  });

  it("saves the amount it shows", () => {
    const p = props();
    render(createElement(LogForm, { ...p, form: "food" } as never));
    fireEvent.click(screen.getByLabelText("Snuffle mat"));
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    const [body] = p.onLog.mock.calls[0] as unknown as [{ details: { type: string; amount: number; unit: string } }];
    expect(body.details).toMatchObject({ amount: 0.5, unit: "serving" });
  });
});

describe("Food layout (TEC-263)", () => {
  it("puts Servings left of What on one line, about as wide as its label, with What taking the rest", () => {
    render(createElement(LogForm, { ...props(), form: "food" } as never));
    const what = screen.getByLabelText("What") as HTMLSelectElement;
    expect(servings().compareDocumentPosition(what) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(servings().parentElement!.parentElement).toBe(what.parentElement!.parentElement);
    expect(servings().className).toContain("w-[64px]");
    expect(what.parentElement!.className).toContain("flex-1");
    expect(what.className).toContain("w-full");
  });

  it("says why What is wider than half (source check)", () => {
    const src = readFileSync(resolve(__dirname, "../app/LogForm.tsx"), "utf8");
    expect(src).toContain("What is wider than half on purpose: it holds a food's name");
  });
});

describe("Potty layout (TEC-263)", () => {
  it("has Where on its own line under What, each a full line", () => {
    render(createElement(LogForm, { ...props(), form: "potty" } as never));
    const what = screen.getByRole("radiogroup", { name: "What" });
    const where = screen.getByRole("radiogroup", { name: "Where" });
    expect(what.compareDocumentPosition(where) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(what.parentElement!.parentElement).toBe(where.parentElement!.parentElement);
    expect(what.parentElement!.className).not.toContain("w-1/2");
    expect(where.parentElement!.className).not.toContain("w-1/2");
  });
});
