// TEC-202: the shared field class carries no width. Tailwind writes `.w-full` after `.w-[64px]`, `.w-[76px]` and
// `.w-auto`, so a `w-full` inside the shared class beat every narrow field (Health's Dose spread over the
// Medication pick). Each field names its own width instead; these tests hold that.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import LogForm from "@/app/LogForm";
import type { FormKind, JournalEvent } from "@/lib/events";

const SRC = readFileSync(resolve(__dirname, "../app/LogForm.tsx"), "utf8");
const classOf = (name: string): string => {
  const m = SRC.match(new RegExp(`const ${name} =\\s*(?:\`([^\`]*)\`|"([^"]*)")`));
  expect(m, `${name} is declared`).not.toBeNull();
  const body = m![1] ?? m![2];
  return body.includes("${input}") ? body.replace("${input}", classOf("input")) : body;
};

const props = {
  people: [{ id: "p1", display_name: "Test" }],
  dogs: [],
  onAddDog: async () => ({ dog: null, error: null }),
  foods: [],
  onAddFood: async () => ({ food: null, error: null }),
  medications: [],
  onAddMedication: async () => ({ medication: null, error: null }),
  phonePerson: "p1",
  events: [] as JournalEvent[],
  photoUrls: {},
  onPhotoUrl: () => {},
  remembered: {},
  weightUnit: "lb" as const,
  onLog: () => {},
  onChange: async () => ({ error: null }),
  onUpcoming: async () => ({ error: null }),
  onPotty: () => {},
  unsaved: {},
  onRetry: () => {},
};
const render = (form: FormKind, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(LogForm, { ...props, form, ...extra } as never));
/** The class list of the element with this id. */
const classes = (html: string, id: string) => {
  const tag = html.match(new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`));
  expect(tag, `#${id} is in the form`).not.toBeNull();
  return (tag![0].match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/);
};
const hasWidth = (cls: string[]) => cls.some((c) => /^w-/.test(c));

describe("field widths (TEC-202)", () => {
  it("the shared field class carries no width, and the full-width one is the shared class plus w-full", () => {
    expect(hasWidth(classOf("input").split(/\s+/))).toBe(false);
    expect(classOf("inputFull").split(/\s+/)).toContain("w-full");
  });

  it("Dose, Unit, Time and Weight keep their narrow widths and never carry w-full", () => {
    const med = render("health", { healthType: "medication" });
    expect(classes(med, "f-dose")).toContain("w-[64px]");
    expect(classes(med, "f-dose")).not.toContain("w-full");
    expect(classes(med, "f-med-unit")).toContain("w-auto");
    expect(classes(med, "f-med-unit")).not.toContain("w-full");
    const training = render("training");
    expect(classes(training, "f-mins")).toContain("w-[76px]");
    expect(classes(training, "f-mins")).not.toContain("w-full");
    const weight = render("weight");
    expect(classes(weight, "f-value")).toContain("w-[96px]");
    expect(classes(weight, "f-value")).not.toContain("w-full");
  });

  it("the Medication pick fills what is left of its row, beside Dose and Unit", () => {
    const med = render("health", { healthType: "medication" });
    expect(classes(med, "f-med")).toContain("w-full");
  });

  it("Repeat's number and unit boxes are narrow in the source", () => {
    expect(SRC).toContain("className={`${input} w-[64px]`}");
    expect(SRC).toContain('aria-label="Repeat unit"');
    expect(SRC).toMatch(/aria-label="Repeat unit"[^\n]*className=\{`\$\{input\} w-auto`\}/);
  });

  it("no narrow field is built on the full-width class", () => {
    expect(SRC).not.toMatch(/\$\{inputFull\} w-/);
  });

  it("Logging as is 44px tall in the bottom row beside Save, in one flex row (TEC-252)", () => {
    const html = render("potty");
    const row = html.slice(html.indexOf('data-section="save"'));
    expect(row).toContain('class="flex items-center gap-2"');
    expect(classes(html, "f-who")).toContain("h-[44px]");
    expect(html).not.toContain('id="f-when"');
  });
});
