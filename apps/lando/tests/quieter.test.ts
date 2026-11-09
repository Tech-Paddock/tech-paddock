// TEC-250: a compact Next 7 days, a plain Treats counter apart from Medical issue, and a small Attach link.
// Rendered to markup (no DOM), as boxedforms.test.ts does; invented data only (RULES.md, Never 2).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import LogForm from "@/app/LogForm";
import PhotoPicker from "@/app/Photos";
import TreatCount from "@/app/TreatCount";
import UpcomingList from "@/app/UpcomingList";
import type { FormKind, JournalEvent } from "@/lib/events";
import type { Upcoming } from "@/lib/upcoming";

const TODAY = "2026-11-08";
const plan = (over: Partial<Upcoming>): Upcoming =>
  ({
    id: "a0000000-0000-4000-8000-000000000001",
    kind: "vet",
    title: "Vet visit",
    note: "second round of shots",
    due_on: "2026-11-10",
    due_time: "10:30",
    repeat_every: 6,
    repeat_unit: "month",
    status: "open",
    ...over,
  }) as Upcoming;
const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

const formProps = {
  people: [],
  dogs: [],
  onAddDog: async () => ({ dog: null, error: null }),
  foods: [],
  onAddFood: async () => ({ food: null, error: null }),
  medications: [],
  onAddMedication: async () => ({ medication: null, error: null }),
  phonePerson: null,
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
  renderToStaticMarkup(createElement(LogForm, { ...formProps, form, ...extra } as never));
const secondary = (html: string) => html.slice(html.indexOf('data-section="secondary"'), html.indexOf('data-section="note"'));

describe("the compact Next 7 days row", () => {
  const html = renderToStaticMarkup(
    createElement(UpcomingList, { compact: true, items: [plan({}), plan({ id: "a0000000-0000-4000-8000-000000000002", title: "Heartworm pill", kind: "medication", due_on: "2026-11-05", due_time: null })], today: TODAY, onDone: async () => {}, onEdit: () => {} })
  );
  it("is one line: a dot, the name, when, and a small Done; no detail line, no note, no card border", () => {
    expect(html).toContain("Vet visit");
    expect(html).toContain("Tue Nov 10, 10:30 AM");
    expect(html).toContain("lando-cal-dot");
    expect(html).toContain("Done: Vet visit");
    expect(html).not.toContain("every 6 months");
    expect(html).not.toContain("> · second round"); // the note is only in the tap's title
    expect(html).not.toContain("rounded-xl border");
    expect(html).not.toContain("bg-accent");
  });
  it("shows an overdue time in red and says so in words, and taps to edit", () => {
    expect(html).toMatch(/text-danger">Thu Nov 5/);
    expect(html).toContain("red, overdue");
    expect(html).toContain("Edit ");
  });
  it("keeps a 44px hit area on the tap and on Done", () => {
    expect(html.match(/min-h-\[44px\]/g)!.length).toBeGreaterThanOrEqual(4);
  });
  it("the Log uses it with a Calendar link in the heading; the feed's Upcoming filter keeps the full rows (source check)", () => {
    const journal = read("app/Journal.tsx");
    expect(journal).toContain("<UpcomingList compact items={week}");
    expect(journal).toContain('onClick={() => showTab("calendar")}');
    expect(journal).toContain("<UpcomingList items={allOpen}");
  });
});

describe("Treats and Medical issue", () => {
  it("the Treats counter has no box around its buttons but keeps 44px hit areas", () => {
    const html = renderToStaticMarkup(createElement(TreatCount, { value: 0, onChange: () => {} }));
    expect(html).not.toContain("border");
    expect(html).not.toContain("bg-surface");
    expect(html.match(/h-\[44px\]/g)).toHaveLength(2);
  });
  it("Potty: no Treats-and-links box; Treats, a divider, then Medical issue as its own checkbox that opens Related issue", () => {
    const html = render("potty");
    expect(html).not.toContain("Treats and links");
    const second = secondary(html);
    expect(second).not.toContain("border-line bg-paper");
    expect(second.indexOf("Treats")).toBeLessThan(second.indexOf("w-px"));
    expect(second.indexOf("w-px")).toBeLessThan(second.indexOf("Medical issue"));
    expect(second).toContain('type="checkbox"');
    expect(second).not.toContain("f-issue"); // unticked: the picker is hidden
    expect(read("app/LogForm.tsx")).toContain("const issueSelect = hasIssue && issueField;");
  });
  it("Training and Fun use the same counter, with no Medical issue", () => {
    for (const f of ["training", "fun"] as const) {
      const second = secondary(render(f));
      expect(second).toContain("Treats");
      expect(second).not.toContain("Medical issue");
      expect(second).not.toContain("border-line bg-paper");
    }
  });
  it("Health keeps Related issue and Related note, without the box", () => {
    const html = render("health");
    expect(html).toContain("Related note");
    expect(secondary(html)).not.toContain("border-line bg-paper");
  });
  it("Training: Treats, a thin divider, then Related note, on one line (TEC-252)", () => {
    const second = secondary(render("training"));
    expect(second.indexOf("Treats")).toBeLessThan(second.indexOf("w-px"));
    expect(second.indexOf("w-px")).toBeLessThan(second.indexOf("Related note"));
    // One flex row that does not wrap, so the note stays beside the counter; the select fills the rest.
    expect(second).toContain('class="flex items-end gap-x-3 "');
    expect(second).toContain("min-w-0 flex-1");
  });
  it("a vet visit and a medication dose put Related issue and Related note side by side; a medical issue has the note alone (TEC-252)", () => {
    for (const healthType of ["vet", "medication"]) {
      const second = secondary(render("health", { healthType }));
      const pair = second.slice(second.indexOf("grid grid-cols-2"));
      expect(pair.indexOf("Related issue")).toBeGreaterThan(-1);
      expect(pair.indexOf("Related issue")).toBeLessThan(pair.indexOf("Related note"));
    }
    const issue = secondary(render("health", { healthType: "issue" }));
    expect(issue).not.toContain("grid-cols-2");
    expect(issue).not.toContain("Related issue");
    expect(issue).toContain("Related note");
  });
  it("What and Where stay in their box", () => {
    const html = render("potty");
    const entry = html.slice(html.indexOf('data-section="entry"'), html.indexOf('data-section="secondary"'));
    expect(entry).toContain("border-line bg-paper");
    expect(entry).toContain("What");
    expect(entry).toContain("Where");
  });
});

describe("the small attachments row", () => {
  const picker = renderToStaticMarkup(
    createElement(PhotoPicker, {
      photos: { shots: [{ key: "k", id: "k", path: "health/k.jpg", preview: "https://example.invalid/k.jpg", picture: true, name: null, status: "done", source: null, blob: null }], notice: null, add: () => {}, retry: () => {}, remove: () => {}, working: false, failed: false, paths: [], names: {} } as never,
    })
  );
  it("shows one small Attach link and the thumbnails; the camera is offered only after the tap", () => {
    expect(picker).toContain("Attach");
    expect(picker).not.toContain("Take photo");
    expect(picker).not.toContain("Choose files");
    expect(picker).toContain('data-attachment="photo"');
    expect(picker).toContain("h-9 w-9");
    expect(read("app/Photos.tsx")).toContain("Take photo");
  });
  it("a thumbnail is a button with options (Open, Remove) rather than a big tile with its own Remove", () => {
    expect(picker).toContain("Photo 1: options");
    expect(picker).not.toContain("aspect-square");
    const src = read("app/Photos.tsx");
    expect(src).toContain("Open");
    expect(src).toContain("Remove");
  });
});
