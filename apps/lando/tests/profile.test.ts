// @vitest-environment jsdom
// TEC-260: Lando's Profile, opened from the app icon in the app bar. The stored details (one row), what the page derives
// from the journal and the plans, and the birth date reaching the vaccine suggestions. jsdom cannot show the layout or
// prove the icon tap on a phone: that is a phone check. Every name, number and id here is invented (RULES.md, Never 2).
import { createElement } from "react";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AppBar from "@/app/AppBar";
import Journal from "@/app/Journal";
import { InvalidEvent, type JournalEvent } from "@/lib/events";
import {
  EMPTY_PROFILE,
  PROFILE_MAX,
  ageText,
  fromRow,
  lastVisit,
  medRows,
  mergeEvents,
  nextVisit,
  parseProfile,
  telHref,
  vaccineRows,
  vaccineStatus,
} from "@/lib/profile";
import { RELEASES } from "@/lib/releases";
import type { Medication } from "@/lib/medications";
import type { Upcoming } from "@/lib/upcoming";
import { visitVaccineEntries } from "@/lib/vaccine-plan";

const root = resolve(__dirname, "..");
const read = (f: string) => readFileSync(resolve(root, f), "utf8");
const MIGRATIONS = resolve(root, "../../supabase/migrations");
const sql = () => {
  const file = readdirSync(MIGRATIONS).find((f) => f.endsWith("_lando_profile.sql"))!;
  return { file, text: readFileSync(resolve(MIGRATIONS, file), "utf8") };
};

const TODAY = "2026-11-09";
const NOW = new Date("2026-11-09T15:00:00Z");

let n = 0;
const uuid = () => `00000000-0000-4000-a000-${String(++n).padStart(12, "0")}`;
const ev = (kind: JournalEvent["kind"], at: string, details: Record<string, unknown>, extra: Partial<JournalEvent> = {}): JournalEvent => ({
  id: uuid(),
  kind,
  at,
  person_id: null,
  details,
  note: null,
  voids: null,
  created_at: at,
  ...extra,
});
const shot = (vaccine: string, at: string, dose?: number) => ev("health", at, { type: "vaccine", reasons: [], vaccine, ...(dose ? { dose } : {}) });
const plan = (over: Partial<Upcoming>): Upcoming =>
  ({ id: uuid(), kind: "vaccine", title: "Vaccine", due_on: "2026-12-01", due_time: null, note: null, repeat_every: null, repeat_unit: null, status: "open", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", ...over }) as Upcoming;

describe("the migration", () => {
  it("is one additive table in the lando schema, RLS on, zero policies, granted to the service role", () => {
    const { text } = sql();
    const code = text.replace(/--.*$/gm, "");
    expect(code).toMatch(/CREATE TABLE lando\.profile \(/);
    expect(code).toMatch(/ALTER TABLE lando\.profile ENABLE ROW LEVEL SECURITY;/);
    expect(code).toMatch(/GRANT ALL ON lando\.profile TO service_role;/);
    expect(code).not.toMatch(/CREATE POLICY|\bDROP\b|\bDELETE\b|\bUPDATE\b|CREATE SCHEMA|\bpublic\./i);
    // One row: the key is a boolean that must be true.
    expect(code).toMatch(/id boolean PRIMARY KEY DEFAULT true CONSTRAINT profile_one_row CHECK \(id\)/);
  });

  it("is later than every other migration", () => {
    const { file } = sql();
    const all = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    expect(all[all.length - 1]).toBe(file);
  });

  it("holds the same longest lengths as the app", () => {
    const { text } = sql();
    for (const [col, max] of Object.entries(PROFILE_MAX)) {
      expect(text, col).toMatch(new RegExp(`${col} text CHECK \\(${col} IS NULL OR char_length\\(${col}\\) BETWEEN 1 AND ${max}\\)`));
    }
  });

  it("seeds no row and holds no detail", () => {
    expect(sql().text.replace(/--.*$/gm, "")).not.toMatch(/INSERT/i);
  });
});

describe("parseProfile", () => {
  it("trims, tidies spaces and turns empty text into null", () => {
    const p = parseProfile({ breed: "  Test   Hound ", birth_on: "2026-06-14", microchip: "", insurance_provider: "  ", clinic_phone: "(555) 010-0100" }, NOW);
    expect(p).toEqual({ ...EMPTY_PROFILE, breed: "Test Hound", birth_on: "2026-06-14", clinic_phone: "(555) 010-0100" });
  });
  it("refuses a birthday that is not a day or is in the future", () => {
    expect(() => parseProfile({ birth_on: "2026-02-31" }, NOW)).toThrow(InvalidEvent);
    expect(() => parseProfile({ birth_on: "2027-01-01" }, NOW)).toThrow(/future/);
    expect(parseProfile({ birth_on: "2026-11-10" }, NOW).birth_on).toBe("2026-11-10");
  });
  it("refuses too-long text and a phone with letters, and says nothing of what was typed", () => {
    const secret = "SECRET-POLICY-123456";
    for (const bad of [{ insurance_policy: secret.repeat(5) }, { clinic_phone: `call ${secret}` }, { microchip: 5 }]) {
      try {
        parseProfile(bad, NOW);
        throw new Error("should have refused");
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidEvent);
        expect((e as Error).message).not.toContain("SECRET");
      }
    }
  });
  it("refuses anything that is not an object", () => {
    for (const bad of [null, "x", 3, []]) expect(() => parseProfile(bad, NOW)).toThrow(InvalidEvent);
  });
  it("reads a row, or nothing, as the details", () => {
    expect(fromRow(null)).toEqual(EMPTY_PROFILE);
    expect(fromRow({ breed: "Test Hound", updated_at: "x", id: true }).breed).toBe("Test Hound");
  });
});

describe("telHref", () => {
  it("is the phone's digits, with a plus kept", () => {
    expect(telHref("(555) 010-0142")).toBe("tel:5550100142");
    expect(telHref("+1 555 010 0142")).toBe("tel:+15550100142");
    expect(telHref(null)).toBeNull();
    expect(telHref("--")).toBeNull();
  });
});

describe("ageText", () => {
  it("speaks in days, weeks, months, then years", () => {
    expect(ageText("2026-11-01", TODAY)).toBe("8 days old");
    expect(ageText("2026-06-14", TODAY)).toBe("21 weeks old");
    expect(ageText("2026-02-09", TODAY)).toBe("9 months old");
    expect(ageText("2024-08-09", TODAY)).toBe("2 years, 3 months old");
    expect(ageText("2024-11-09", TODAY)).toBe("2 years old");
  });
  it("is null with no birthday or one after today", () => {
    expect(ageText(null, TODAY)).toBeNull();
    expect(ageText("2026-12-01", TODAY)).toBeNull();
  });
});

describe("vaccine status", () => {
  it("is red before today, amber through a week, green after", () => {
    expect(vaccineStatus("2026-11-08", TODAY)).toBe("red");
    expect(vaccineStatus("2026-11-09", TODAY)).toBe("yellow");
    expect(vaccineStatus("2026-11-16", TODAY)).toBe("yellow");
    expect(vaccineStatus("2026-11-17", TODAY)).toBe("green");
  });
});

describe("vaccineRows", () => {
  it("lists the four vaccines, not logged for those without an entry", () => {
    const rows = vaccineRows([], [], null, TODAY);
    expect(rows.map((r) => r.label)).toEqual(["DHPP", "Bordetella", "Leptospirosis", "Rabies"]);
    expect(rows.every((r) => r.status === null && r.lastOn === null && r.offer === null)).toBe(true);
  });

  it("reads the last date and a status from the rules when nothing is planned, and offers Plan next", () => {
    const events = [shot("rabies", "2026-10-01T15:00:00Z"), shot("bordetella", "2026-05-02T15:00:00Z")];
    const rows = Object.fromEntries(vaccineRows(events, [], null, TODAY).map((r) => [r.id, r]));
    expect(rows.rabies.lastOn).toBe("2026-10-01");
    expect(rows.rabies.nextOn).toBe("2027-10-01");
    expect(rows.rabies.status).toBe("green");
    expect(rows.bordetella.nextOn).toBe("2026-11-02");
    expect(rows.bordetella.status).toBe("red");
    expect(rows.rabies.offer?.kind).toBe("vaccine");
    expect(rows.rabies.offer?.due_on).toBe("2027-10-01");
  });

  it("takes an open plan's date over the rules, and offers nothing more", () => {
    const events = [shot("bordetella", "2026-05-02T15:00:00Z")];
    const planned = plan({ title: "Vaccine · Bordetella", due_on: "2026-11-13" });
    const row = vaccineRows(events, [planned], null, TODAY).find((r) => r.id === "bordetella")!;
    expect(row.nextOn).toBe("2026-11-13");
    expect(row.status).toBe("yellow");
    expect(row.planned).toBe(planned);
    expect(row.offer).toBeNull();
  });

  it("uses Lando's real age for the puppy series, once the birth date is known", () => {
    // A first dose at 20 weeks: the dose number alone says puppy series (3 weeks), the age says yearly.
    const events = [shot("dhpp", "2026-11-01T15:00:00Z", 1)];
    const without = vaccineRows(events, [], null, TODAY).find((r) => r.id === "dhpp")!;
    const withAge = vaccineRows(events, [], "2026-06-14", TODAY).find((r) => r.id === "dhpp")!;
    expect(without.nextOn).toBe("2026-11-22");
    expect(without.offer?.title).toBe("Vaccine · DHPP · dose 2");
    expect(withAge.nextOn).toBe("2027-11-01");
    expect(withAge.offer?.title).toBe("Vaccine · DHPP");
  });

  it("ignores a medication's dose, a voided shot and a plan for another vaccine", () => {
    const med = ev("health", "2026-11-05T15:00:00Z", { type: "medication", reasons: [], med_name: "Test Chew", dose: 1, unit: "chew" });
    const gone = shot("rabies", "2026-10-01T15:00:00Z");
    const voider = ev("void", "2026-10-02T15:00:00Z", {}, { voids: gone.id });
    const rows = vaccineRows([med, gone, voider], [plan({ title: "Vaccine · DHPP", due_on: "2026-11-12" })], null, TODAY);
    expect(rows.find((r) => r.id === "rabies")!.lastOn).toBeNull();
    expect(rows.find((r) => r.id === "bordetella")!.planned).toBeNull();
    expect(rows.find((r) => r.id === "dhpp")!.planned).not.toBeNull();
  });
});

describe("the vet and the medications", () => {
  it("finds the newest live vet visit and the soonest open vet plan", () => {
    const old = ev("health", "2026-09-01T15:00:00Z", { type: "vet", reasons: ["checkup"] });
    const recent = ev("health", "2026-09-30T15:00:00Z", { type: "vet", reasons: ["vaccines"] });
    expect(lastVisit([old, recent, shot("rabies", "2026-11-01T15:00:00Z")])).toBe(recent);
    expect(lastVisit([])).toBeNull();
    const later = plan({ kind: "vet", title: "Vet visit", due_on: "2026-12-20" });
    const sooner = plan({ kind: "vet", title: "Vet visit", due_on: "2026-11-20" });
    const done = plan({ kind: "vet", title: "Vet visit", due_on: "2026-11-10", status: "done" });
    expect(nextVisit([later, sooner, done])).toBe(sooner);
    expect(nextVisit([])).toBeNull();
  });

  it("pairs each medication that is not retired with its soonest plan, by name", () => {
    const meds: Medication[] = [
      { id: uuid(), name: "Test Chew", unit: "chew", reason: "heartworm" },
      { id: uuid(), name: "Old Syrup", unit: "ml", retired: true },
      { id: uuid(), name: "Plain Pill", unit: "tablet" },
    ];
    const p1 = plan({ kind: "medication", title: "test chew · 1 chew", due_on: "2026-11-15" });
    const p2 = plan({ kind: "medication", title: "Test Chew", due_on: "2026-12-15" });
    const rows = medRows(meds, [p2, p1]);
    expect(rows.map((r) => r.med.name)).toEqual(["Test Chew", "Plain Pill"]);
    expect(rows[0].next).toBe(p1);
    expect(rows[1].next).toBeNull();
  });

  it("merges two reads once per entry", () => {
    const a = shot("rabies", "2026-10-01T15:00:00Z");
    expect(mergeEvents([a], [a, shot("dhpp", "2026-10-02T15:00:00Z")])).toHaveLength(2);
  });
});

describe("the birth date reaches the vaccine suggestions", () => {
  it("a vet visit's Vaccines given plans from Lando's age", () => {
    const base = { given: ["dhpp"], visitId: uuid(), at: "2026-11-01T15:00:00Z", personId: null, events: [] as JournalEvent[], idFor: () => uuid(), planNext: true };
    const noAge = Object.values(visitVaccineEntries(base).plans)[0];
    const aged = Object.values(visitVaccineEntries({ ...base, birthOn: "2026-06-14" }).plans)[0];
    expect(noAge.due_on).toBe("2026-11-22");
    expect(aged.due_on).toBe("2027-11-01");
  });

  it("LogForm passes the stored birth date to nextDose at both of its calls, and Journal hands it down", () => {
    const form = read("app/LogForm.tsx");
    expect(form.match(/nextDose\(\{[^}]*birthOn \}\)/g)).toHaveLength(2);
    expect(form).toMatch(/birthOn: birthOn,?|birthOn,\n\s+idFor/);
    expect(read("app/Journal.tsx")).toContain("birthOn={profileData?.details.birth_on ?? null}");
  });
});

describe("what the code never does with the details", () => {
  it("logs nothing in the profile's files", () => {
    for (const f of ["lib/profile.ts", "lib/profile-db.ts", "app/api/profile/route.ts", "app/Profile.tsx", "app/ProfileButton.tsx"]) {
      expect(read(f), f).not.toMatch(/console\.|logger\./);
    }
  });
  it("keeps no detail in the repo, in a fixture or a release note", () => {
    for (const r of RELEASES) expect(r.text).not.toMatch(/\bmicrochip \d|policy number \d/i);
  });
  it("has a release note for the Profile", () => {
    expect(RELEASES.some((r) => /Profile/.test(r.text))).toBe(true);
  });
});

/* ── The screen ──────────────────────────────────────────────────────────── */

const MED: Medication = { id: "11111111-1111-4111-8111-111111111111", name: "Test Chew", unit: "chew", reason: "heartworm" };
const PERSON = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", display_name: "Tester" };

function wire(opts: { profile?: Record<string, unknown>; history?: JournalEvent[]; events?: JournalEvent[]; items?: Upcoming[]; saveStatus?: number } = {}) {
  const posts: { url: string; body: unknown }[] = [];
  let stored = { ...EMPTY_PROFILE, ...(opts.profile ?? {}) };
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (url.startsWith("/api/journal")) return json({ events: opts.events ?? [], people: [PERSON], dogs: [], foods: [], medications: [MED], photos: {} });
    if (url === "/api/upcoming") {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push({ url, body });
        return json({ item: { ...plan({ id: uuid() }), ...body.item } });
      }
      return json({ items: opts.items ?? [], photos: {} });
    }
    if (url === "/api/profile") {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push({ url, body });
        if (opts.saveStatus) return json({ error: "birthday can't be in the future" }, opts.saveStatus);
        stored = body;
        return json({ profile: stored });
      }
      return json({ profile: stored, history: opts.history ?? [] });
    }
    return json({}, 404);
  });
  return posts;
}

async function open() {
  localStorage.setItem("lando.person", JSON.stringify(PERSON.id));
  render(createElement("div", null, createElement(AppBar), createElement(Journal)));
  const icon = screen.getByRole("button", { name: "Profile" });
  await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
  fireEvent.click(icon);
  return await screen.findByRole("heading", { name: "Profile" });
}

beforeEach(() => {
  // jsdom has no matchMedia, which the theme switch in the app bar reads.
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  window.scrollTo = () => {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("the app bar and the Profile page", () => {
  it("shows the app icon as a 44px button named Profile in place of the word, and keeps five tabs", () => {
    wire();
    render(createElement(AppBar));
    const btn = screen.getByRole("button", { name: "Profile" });
    expect(btn.className).toContain("h-[44px]");
    expect(btn.className).toContain("w-[44px]");
    expect(btn.querySelector("img")?.getAttribute("src")).toBe("/icon.svg");
    // The name stays for screen readers only; it is no longer drawn.
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.className).toContain("sr-only");
    expect(read("app/Journal.tsx").match(/role="tab"/g)).toHaveLength(5);
  });

  it("opens Profile on the icon, with Back, and Back returns to the tabs", async () => {
    wire({ profile: { breed: "Test Hound", birth_on: "2026-06-14", clinic_name: "Test Clinic", clinic_phone: "(555) 010-0100", microchip: "TESTCHIP-0001", insurance_provider: "Test Mutual", insurance_policy: "TEST-POLICY-9" } });
    await open();
    await waitFor(() => expect(screen.getByText("Test Hound")).toBeTruthy());
    expect(screen.getByText("TESTCHIP-0001")).toBeTruthy();
    expect(screen.getByText("TEST-POLICY-9")).toBeTruthy();
    expect(screen.getByText("Test Mutual")).toBeTruthy();
    const phone = screen.getByRole("link", { name: "(555) 010-0100" });
    expect(phone.getAttribute("href")).toBe("tel:5550100100");
    for (const name of ["Basics", "Vet", "Vaccines", "Regular medications"]) expect(screen.getByRole("region", { name })).toBeTruthy();
    // The tabs are hidden while Profile is open, and back when it closes.
    expect(screen.getByRole("tablist", { hidden: true }).hasAttribute("hidden")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.queryByRole("heading", { name: "Profile" })).toBeNull();
    expect(screen.getByRole("tablist").hasAttribute("hidden")).toBe(false);
    expect(screen.getAllByRole("tab")).toHaveLength(5);
  });

  it("shows each vaccine's status in words as well as its colour, and Plan next adds the plan", async () => {
    const posts = wire({ history: [shot("rabies", "2026-10-01T15:00:00Z"), shot("bordetella", "2026-05-02T15:00:00Z")] });
    await open();
    const rabies = await screen.findByText("Rabies");
    const row = rabies.closest("li")!;
    expect(row.getAttribute("data-status")).toBe("green");
    expect(row.className).toContain("lando-pill");
    expect(row.textContent).toContain("good");
    const bord = screen.getByText("Bordetella").closest("li")!;
    expect(bord.getAttribute("data-status")).toBe("red");
    expect(bord.textContent).toContain("overdue");
    expect(screen.getByText("DHPP").closest("li")!.textContent).toContain("not logged");
    fireEvent.click(within(rabies.closest("li")!).getByRole("button", { name: "Plan next Rabies" }));
    await waitFor(() => expect(posts.some((p) => p.url === "/api/upcoming")).toBe(true));
    const sent = posts.find((p) => p.url === "/api/upcoming")!.body as { action: string; item: { kind: string; title: string } };
    expect(sent.action).toBe("add");
    expect(sent.item.kind).toBe("vaccine");
    expect(sent.item.title).toBe("Vaccine · Rabies");
    // Once planned, the row says so and offers nothing more.
    await waitFor(() => expect(within(screen.getByText("Rabies").closest("li")!).queryByRole("button")).toBeNull());
  });

  it("lists a regular medication with its reason", async () => {
    wire();
    await open();
    const med = (await screen.findByText("Test Chew")).closest("li")!;
    expect(med.textContent).toContain("Heartworm");
  });

  it("Edit opens a small form with the stored values and Save sends them; an error stays on the form", async () => {
    const posts = wire({ profile: { breed: "Test Hound" } });
    await open();
    await waitFor(() => expect(screen.getByText("Test Hound")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit profile" });
    const breed = within(dialog).getByLabelText("Breed") as HTMLInputElement;
    expect(breed.value).toBe("Test Hound");
    expect(breed.className).toContain("min-h-[44px]");
    fireEvent.change(within(dialog).getByLabelText("Birthday"), { target: { value: "2026-06-14" } });
    fireEvent.change(within(dialog).getByLabelText("Policy number"), { target: { value: "TEST-POLICY-9" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit profile" })).toBeNull());
    const sent = posts.find((p) => p.url === "/api/profile")!.body as Record<string, unknown>;
    expect(sent).toEqual({ ...EMPTY_PROFILE, breed: "Test Hound", birth_on: "2026-06-14", insurance_policy: "TEST-POLICY-9" });
    expect(await screen.findByText("TEST-POLICY-9")).toBeTruthy();
  });

  it("keeps the form open and says why when a save is refused", async () => {
    wire({ saveStatus: 400 });
    await open();
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit profile" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("future");
    expect(screen.getByRole("dialog", { name: "Edit profile" })).toBeTruthy();
  });
});

describe("the route", () => {
  it("is behind the gate like every other, and validates before it writes", () => {
    const src = read("app/api/profile/route.ts");
    expect(src).toContain("parseProfile(body)");
    expect(src).toMatch(/InvalidEvent[\s\S]*status: 400/);
    // No route here opts out of the gate: the gate file lists the signed-out paths and /api/profile is not one.
    expect(read("proxy.ts")).not.toContain("api/profile");
  });
});
