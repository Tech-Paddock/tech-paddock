// TEC-255: one field class (the same padding and 44px height everywhere) and fixed widths, never a size taken from a
// field's content; half the section is the default and a wider field says why. Below that, TEC-202: the shared field class carries no width. Tailwind writes `.w-full` after `.w-[64px]`, `.w-[76px]` and
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
    expect(classes(med, "f-med-unit")).toContain("w-[88px]");
    expect(classes(med, "f-med-unit")).not.toContain("w-full");
    const training = render("training");
    expect(classes(training, "f-mins")).toContain("w-[76px]");
    expect(classes(training, "f-mins")).not.toContain("w-full");
    const weight = render("weight");
    expect(classes(weight, "f-value")).toContain("w-[96px]");
    expect(classes(weight, "f-value")).not.toContain("w-full");
  });

  it("the Medication pick is half its row, beside Dose and Unit, and fills that half", () => {
    const med = render("health", { healthType: "medication" });
    expect(classes(med, "f-med")).toContain("w-full");
    expect(med).toContain('<div class="grid min-w-0 content-start gap-0.5 w-1/2"><label for="f-med"');
  });

  it("Repeat's number and unit boxes are narrow in the source", () => {
    expect(SRC).toContain("className={`${input} w-[64px]`}");
    expect(SRC).toContain('aria-label="Repeat unit"');
    expect(SRC).toMatch(/aria-label="Repeat unit"[^\n]*className=\{`\$\{input\} w-\[96px\]`\}/);
  });

  it("no narrow field is built on the full-width class", () => {
    expect(SRC).not.toMatch(/\$\{inputFull\} w-/);
  });

  it("Logging as is a half of the When row, 44px tall, filling its half (TEC-261)", () => {
    const html = render("potty");
    expect(html).toContain('<div data-section="when-who" class="grid grid-cols-2 items-end gap-2">');
    expect(classes(html, "f-who")).toContain("min-h-[44px]");
    expect(classes(html, "f-who")).toContain("w-full");
    expect(html).not.toContain('id="f-when"');
  });

  it("Save is on its own line, 44px tall and only as wide as its words, never stretched (TEC-261)", () => {
    const html = render("potty");
    const save = html.match(/<button type="submit"[^>]*>/)![0];
    expect(save).toContain("h-[44px]");
    expect(save).toContain("shrink-0");
    expect(save).not.toMatch(/\bflex-1\b|\bw-full\b/);
  });
});

describe("one field class, fixed widths (TEC-255)", () => {
  const forms: [FormKind, Record<string, unknown>][] = [
    ["potty", {}],
    ["food", {}],
    ["fun", {}],
    ["training", {}],
    ["weight", {}],
    ["health", {}],
    ["health", { healthType: "medication" }],
  ];
  /** Every text box, number box and select a form draws, by its opening tag. */
  const fields = (html: string) => [...html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)].map((m) => m[0]).filter((t) => /border-line bg-surface/.test(t));

  it("every field has the same padding and a 44px minimum height", () => {
    for (const [form, extra] of forms) {
      const found = fields(render(form, extra));
      expect(found.length, form).toBeGreaterThan(0);
      for (const tag of found) {
        expect(tag, `${form}: ${tag}`).toContain("px-2.5 py-1.5");
        expect(tag, `${form}: ${tag}`).toMatch(/min-h-\[44px\]/);
      }
    }
  });

  it("no field takes its width from its content, and none but the Note is wider than a column", () => {
    for (const [form, extra] of forms) {
      for (const tag of fields(render(form, extra))) {
        expect(tag, `${form}: ${tag}`).not.toMatch(/\bw-auto\b|\bflex-1\b/);
      }
    }
    expect(SRC).not.toMatch(/className=\{?"?[^\n]*\bw-auto\b/);
    expect(SRC).not.toContain("nameBoxWidth");
  });

  it("the half-width default is one class, and the Note says why it is full width", () => {
    expect(classOf("inputHalf").split(/\s+/)).toContain("w-1/2");
    expect(SRC).toContain("Full width on purpose");
  });

  it("Where is back on its own line under What on Potty (TEC-263)", () => {
    const html = render("potty");
    const label = (w: string) => `<span class="text-[11px] uppercase tracking-[0.06em] text-ink-soft">${w}</span>`;
    expect(html).toContain(label("What"));
    expect(html).toContain(label("Where"));
    expect(html.indexOf(label("What"))).toBeLessThan(html.indexOf(label("Where")));
    // Neither is a half-width column beside the other.
    expect(html).not.toContain('w-1/2"><span class="text-[11px] uppercase tracking-[0.06em] text-ink-soft">Where</span>');
    expect(html).not.toContain('w-1/2"><span class="text-[11px] uppercase tracking-[0.06em] text-ink-soft">What</span>');
  });

  it("no form says that defaults are filled in", () => {
    for (const [form, extra] of forms) expect(render(form, extra)).not.toContain("Defaults are filled in");
  });
});
