import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FORM_KINDS,
  emptyFeedText,
  feedTone,
  formOf,
  inPicks,
  toggleForm,
  type FormKind,
  type JournalEvent,
} from "@/lib/events";

// TEC-177. Invented entries only.
let n = 0;
const ev = (kind: JournalEvent["kind"], details: Record<string, unknown>): JournalEvent => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  kind,
  at: new Date(2026, 9, 27, 9).toISOString(),
  person_id: null,
  details,
  note: null,
  voids: null,
  created_at: new Date(2026, 9, 27, 9).toISOString(),
});
const potty = (where: "inside" | "outside", what = "pee") => ev("potty", { what, where });
const ex = (type: string) => ev("exercise", { type, where: "outside", with_dogs: false, minutes: 10, treats: 0 });
const samples: Record<FormKind, JournalEvent> = {
  potty: potty("outside"),
  food: ev("food", { type: "meal", item_id: "x", item_name: "X", kcal_per: null, unit: null, amount: 1 }),
  fun: ex("walk"),
  training: ex("training"),
  weight: ev("weight", { value: 7, unit: "lb" }),
  health: ev("health", { type: "vet", reasons: ["checkup"] }),
};

describe("the feed filter picks several forms (TEC-177)", () => {
  // Rows as the screen builds them: a saved entry's form, or an unsaved body's.
  const rows = [...FORM_KINDS.map((k) => ({ form: formOf(samples[k]), label: k })), { form: formOf(ex("training")), label: "unsaved training" }];
  const shown = (picks: FormKind[]) => rows.filter((r) => inPicks(picks, r.form)).map((r) => r.label);

  it("shows everything with no picks", () => {
    expect(shown([])).toHaveLength(rows.length);
  });

  it("shows one form's rows, unsaved ones too", () => {
    expect(shown(["training"])).toEqual(["training", "unsaved training"]);
  });

  it("shows the rows of every picked form", () => {
    expect(shown(["food", "health"])).toEqual(["food", "health"]);
  });

  it("toggles each form on its own", () => {
    let p = toggleForm([], "food");
    p = toggleForm(p, "health");
    expect(p).toEqual(["food", "health"]);
    expect(toggleForm(p, "food")).toEqual(["health"]);
    expect(toggleForm(toggleForm(p, "health"), "food")).toEqual([]);
  });

  it("reads as All when every form is picked", () => {
    let p: FormKind[] = [];
    for (const k of FORM_KINDS) p = toggleForm(p, k);
    expect(p).toEqual([]);
    expect(shown(p)).toHaveLength(rows.length);
  });

  it("drops a void from any pick", () => {
    expect(inPicks(["potty"], null)).toBe(false);
  });

  it("says what is empty", () => {
    expect(emptyFeedText([])).toBe("Nothing logged yet.");
    expect(emptyFeedText(["fun"])).toBe("No fun entries yet.");
    expect(emptyFeedText(["fun", "weight"])).toBe("No entries yet for those.");
  });
});

describe("every form wears a colour (TEC-177)", () => {
  const css = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");
  const src = readFileSync(resolve(__dirname, "../app/Journal.tsx"), "utf8");

  it("names a --lando-kind-* in light and in both dark rules, and a data-kind rule, for each form", () => {
    for (const k of FORM_KINDS) {
      expect(css.match(new RegExp(`--lando-kind-${k}: rgb`, "g"))?.length).toBe(3);
      expect(css).toContain(`[data-kind="${k}"] {\n  --kind: var(--lando-kind-${k});`);
    }
  });

  it("colours a row by its form, and an accident red over Potty's colour", () => {
    for (const k of FORM_KINDS) expect(feedTone(samples[k])).toBe(k);
    expect(feedTone(potty("inside"))).toBe("accident");
    expect(feedTone(potty("inside", "none"))).toBe("potty"); // No potty is never an accident
    expect(css).toContain('[data-kind="accident"] {\n  --kind: var(--lando-status-red);');
  });

  it("puts the colour on saved and unsaved rows and a dot on each form's filter pill", () => {
    expect(src).toContain("data-kind={feedTone(e) ?? undefined}");
    expect(src).toContain("data-kind={formOf(p.body) ?? undefined}");
    expect(src).toContain('data-kind={k} className="lando-kind-dot"');
  });
});

describe("the palette's contrast (TEC-177)", () => {
  const css = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");
  const lin = (c: number[]) => {
    const [r, g, b] = c.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: number[], b: number[]) => {
    const [x, y] = [lin(a), lin(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const tint = (e: number[], surface: number[]) => e.map((v, i) => v * 0.16 + surface[i] * 0.84);
  // The mcl39 tokens in lib/theme.css.
  const modes = {
    light: { paper: [245, 245, 246], surface: [255, 255, 255], ink: [18, 19, 22], block: css.match(/:root \{\n  --lando-kind-potty[\s\S]*?\n\}/)![0] },
    dark: { paper: [12, 12, 13], surface: [23, 23, 25], ink: [244, 241, 236], block: css.match(/:root\[data-mode="dark"\] \{\n  --lando-kind-potty[\s\S]*?\n\}/)![0] },
  };

  for (const [mode, m] of Object.entries(modes)) {
    for (const k of FORM_KINDS) {
      it(`${mode} ${k}: edge on paper and surface at least 4.4, ink on the tint at least 11`, () => {
        const rgb = m.block.match(new RegExp(`--lando-kind-${k}: rgb\\((\\d+) (\\d+) (\\d+)\\)`))!.slice(1).map(Number);
        expect(ratio(rgb, m.paper)).toBeGreaterThanOrEqual(4.4);
        expect(ratio(rgb, m.surface)).toBeGreaterThanOrEqual(4.4);
        expect(ratio(m.ink, tint(rgb, m.surface))).toBeGreaterThanOrEqual(11);
      });
    }
  }
});
