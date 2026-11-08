// @vitest-environment jsdom
// TEC-232: the whole path of "Add a medication…": the Health form, POST /api/medications, the table, and the pick list.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let insertError: { code?: string; message: string } | null = null;

/** An in-memory stand-in for the few PostgREST calls Lando makes: select/order/or/range, insert().select().single(). */
function fakeDb() {
  return {
    from(name: string) {
      const rows = (tables[name] ??= []);
      let pending: Row | null = null;
      let patch: Row | null = null;
      let matchId = "";
      const q: Record<string, unknown> = {};
      const self = () => q;
      Object.assign(q, {
        select: self,
        order: self,
        or: self,
        range: self,
        eq: (_c: string, v: string) => ((matchId = v), q),
        is: self,
        update: (p: Row) => ((patch = p), q),
        in: self,
        insert: (r: Row) => ((pending = r), q),
        single: async () => {
          if (insertError) return { data: null, error: insertError };
          const row = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", created_at: new Date().toISOString(), retired: false, ...pending };
          rows.push(row);
          return { data: row, error: null };
        },
        then: (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) => {
          if (patch) {
            const hit = rows.filter((r) => r.id === matchId && r.reason == null);
            hit.forEach((r) => Object.assign(r, patch));
            return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(ok, fail);
          }
          return Promise.resolve({ data: rows, error: null }).then(ok, fail);
        },
      });
      return q;
    },
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
  };
}

vi.mock("@/lib/supabase", () => ({ getServiceClient: () => fakeDb() }));

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.people = [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", display_name: "Tester", created_at: "2026-01-01T00:00:00Z" }];
  insertError = null;
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** fetch() wired to the real route handlers. */
async function wireFetch() {
  const journal = await import("@/app/api/journal/route");
  const meds = await import("@/app/api/medications/route");
  const upcoming = await import("@/app/api/upcoming/route");
  const { NextRequest } = await import("next/server");
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const u = new URL(url, "http://localhost");
    const req = new NextRequest(u, init as never);
    if (u.pathname === "/api/journal") return journal.GET(req);
    if (u.pathname === "/api/upcoming") return init?.method === "POST" ? upcoming.POST(req) : upcoming.GET();
    if (u.pathname === "/api/medications") return init?.method === "PATCH" ? meds.PATCH(req) : meds.POST(req);
    return new Response("{}", { status: 404 });
  });
}

/** The Medication pick (its label also names the Type radio, so it is found by id). */
function pickList() {
  return document.getElementById("f-med") as HTMLSelectElement;
}

async function openMedicationForm() {
  const Journal = (await import("@/app/Journal")).default;
  render(createElement(Journal));
  // First open on a phone asks whose it is.
  fireEvent.click(await screen.findByRole("button", { name: /Tester/ }));
  await screen.findAllByRole("button", { name: /^Health/ });
  fireEvent.click(screen.getAllByRole("button", { name: /^Health/ })[0]);
  fireEvent.click(await screen.findByRole("radio", { name: "Medication" }));
  await waitFor(() => expect(pickList()).toBeTruthy());
}

describe("Add a medication… (TEC-232)", () => {
  it("saves the medication, lists it in the pick list at once and picks it", async () => {
    await wireFetch();
    await openMedicationForm();
    const pick = pickList();
    fireEvent.change(pick, { target: { value: "__add_med" } });
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Test Drops" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "heartworm" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(tables.medications).toHaveLength(1));
    expect(tables.medications[0]).toMatchObject({ name: "Test Drops", unit: "mg" });
    const after = pickList();
    expect([...after.options].map((o) => o.text)).toContain("Test Drops");
    expect(after.selectedOptions[0].text).toBe("Test Drops");
  });

  it("Save pressed with the add form open adds the medication instead of failing with 'Pick the medication'", async () => {
    await wireFetch();
    await openMedicationForm();
    fireEvent.change(pickList(), { target: { value: "__add_med" } });
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Test Drops" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "heartworm" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save / }));
    await waitFor(() => expect(tables.medications).toHaveLength(1));
    await waitFor(() => expect(pickList().selectedOptions[0].text).toBe("Test Drops"));
    expect(screen.queryByText("Pick the medication.")).toBeNull();
  });

  it("a journal read that started before the add and ends after it does not drop the new medication", async () => {
    await wireFetch();
    await openMedicationForm();
    const real = globalThis.fetch;
    let release: () => void = () => {};
    const held = new Promise<void>((r) => (release = r));
    // The next journal read answers from before the add, and late.
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/journal")) {
        const stale = await real(url, init);
        await held;
        return stale;
      }
      return real(url, init);
    });
    window.dispatchEvent(new Event("focus"));
    fireEvent.change(pickList(), { target: { value: "__add_med" } });
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Test Drops" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "heartworm" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(pickList().selectedOptions[0].text).toBe("Test Drops"));
    release();
    await new Promise((r) => setTimeout(r, 50));
    expect([...pickList().options].map((o) => o.text)).toContain("Test Drops");
  });

  it("a refused add shows a red message and adds nothing to the list", async () => {
    await wireFetch();
    insertError = { code: "XX000", message: "boom" };
    await openMedicationForm();
    fireEvent.change(pickList(), { target: { value: "__add_med" } });
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Test Drops" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "heartworm" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const msg = await screen.findByText(/couldn't add medication: boom/);
    expect(msg.className).toContain("text-danger");
  });
});

describe("a medication's reason (TEC-233)", () => {
  const OLD_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const seed = () => {
    tables.medications = [{ id: OLD_ID, name: "Old Drops", unit: "ml", retired: false, created_at: "2026-11-01T00:00:00Z" }];
  };

  it("the add form asks for a reason and refuses to add without one", async () => {
    await wireFetch();
    await openMedicationForm();
    fireEvent.change(pickList(), { target: { value: "__add_med" } });
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Test Drops" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/pick a reason/);
    expect(tables.medications ?? []).toHaveLength(0);
    const options = [...(screen.getByLabelText("Reason") as HTMLSelectElement).options].map((o) => o.text);
    expect(options).toEqual(["Pick one…", "Heartworm", "Flea & tick", "Dewormer", "Allergy", "Pain", "Antibiotic", "Joint", "Other"]);
  });

  it("an added medication keeps the reason picked for it and shows it", async () => {
    await wireFetch();
    await openMedicationForm();
    fireEvent.change(pickList(), { target: { value: "__add_med" } });
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Test Drops" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "flea-tick" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(tables.medications[0]).toMatchObject({ reason: "flea-tick" }));
    expect((await screen.findByTestId("med-reason")).textContent).toBe("Reason: Flea & tick");
  });

  it("a medication from before shows No reason, can be given one, and then cannot be changed", async () => {
    seed();
    await wireFetch();
    await openMedicationForm();
    fireEvent.change(pickList(), { target: { value: OLD_ID } });
    const box = await screen.findByTestId("med-reason");
    expect(box.textContent).toContain("No reason");
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: "heartworm" } });
    fireEvent.click(screen.getByRole("button", { name: "Set reason" }));
    await waitFor(() => expect(tables.medications[0]).toMatchObject({ reason: "heartworm" }));
    await waitFor(() => expect(screen.getByTestId("med-reason").textContent).toBe("Reason: Heartworm"));
    // Set: there is no select or button left to change it with.
    expect(screen.queryByRole("button", { name: "Set reason" })).toBeNull();
  });

  it("a refused set shows why under the form and the medication stays as the database has it", async () => {
    seed();
    await wireFetch();
    await openMedicationForm();
    fireEvent.change(pickList(), { target: { value: OLD_ID } });
    await screen.findByTestId("med-reason");
    // Someone else set it first.
    tables.medications[0].reason = "pain";
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: "heartworm" } });
    fireEvent.click(screen.getByRole("button", { name: "Set reason" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/already has a reason/);
    expect(tables.medications[0].reason).toBe("pain");
  });
});
