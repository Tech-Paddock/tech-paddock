// @vitest-environment jsdom
// The whole of Today in a browser, against a stand-in for the server: a save
// that fails stays on screen with a Retry and is never shown as saved, an edit
// is a new version of the same entry, and a sitting is logged. Fixtures are invented.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Today from "@/app/Today";
import { localDay } from "@/lib/days";
import { PROMPTS } from "@/lib/prompts";
import type { Today as TodayData } from "@/lib/types";

const ID = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;

let data: TodayData;
let failPosts: boolean;
let posts: { url: string; body: Record<string, unknown> }[];
let gets: string[];

beforeEach(() => {
  failPosts = false;
  posts = [];
  gets = [];
  window.localStorage.clear();
  data = {
    day: localDay(),
    tasks: [
      { id: ID(1), title: "Sample task one", due_on: null, done_on: null },
      { id: ID(2), title: "Sample task later", due_on: "2099-01-01", done_on: null },
    ],
    routines: [{ id: ID(3), name: "Sample routine", weekdays: [0, 1, 2, 3, 4, 5, 6], ticked: false }],
    journal: [
      {
        entry_id: ID(4),
        versions: [
          { id: ID(5), body: "invented first words", created_at: "2026-11-16T08:00:00Z" },
          { id: ID(6), body: "invented second words", created_at: "2026-11-16T09:00:00Z" },
        ],
      },
    ],
    meditation: { streak: 2, sessions: [] },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        return failPosts ? new Response(JSON.stringify({ error: "x" }), { status: 500 }) : new Response(JSON.stringify({ ok: true }));
      }
      gets.push(url);
      return new Response(JSON.stringify(data));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function open() {
  render(createElement(Today));
  await screen.findByText("Sample task one");
}

describe("opening Today", () => {
  it("reads the device's own day and shows the four parts and the quiet link", async () => {
    await open();
    expect(gets[0]).toBe(`/api/today?day=${localDay()}`);
    for (const name of ["Tasks", "Routines", "Journal", "Meditation"]) expect(screen.getByRole("heading", { name })).toBeTruthy();
    expect(screen.getByText("Streak 2 days")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Goals and lists" }).getAttribute("href")).toBe("/more");
    // A task for another day waits behind Later.
    expect(screen.getByText("Later (1)")).toBeTruthy();
  });
});

describe("a save that fails", () => {
  it("keeps the tap on screen with a Retry, never shows it as saved, and lands once on retry", async () => {
    await open();
    failPosts = true;
    fireEvent.change(screen.getByLabelText("New task"), { target: { value: "Sample new task" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Not saved")).toBeTruthy();
    expect(within(alert).getByText("Add task: Sample new task")).toBeTruthy();
    // The list shows what the server holds, and it does not hold the task.
    expect(screen.queryByText("Sample new task")).toBeNull();
    const first = posts[0];
    expect(first.body).toMatchObject({ op: "add", title: "Sample new task" });

    failPosts = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText("Not saved")).toBeNull());
    // The same request, with the same id: the server ignores a repeat.
    expect(posts[1]).toEqual(first);
  });

  it("a failed tick reverts on screen and waits in the banner", async () => {
    await open();
    failPosts = true;
    const box = screen.getByRole("checkbox", { name: "Sample task one" });
    fireEvent.click(box);
    await screen.findByText("Not saved");
    expect(box.getAttribute("aria-checked")).toBe("false");
    expect(window.localStorage.getItem("grid.unsaved")).toContain("Tick task");
  });

  it("a save left behind by a closed tab comes back in the banner", async () => {
    window.localStorage.setItem(
      "grid.unsaved",
      JSON.stringify([{ id: ID(9), label: "Journal entry", url: "/api/journal", body: { op: "save" } }]),
    );
    await open();
    expect(await screen.findByText("Journal entry")).toBeTruthy();
  });
});

describe("the journal", () => {
  it("shows one prompt from the fixed list, and never writes it into the page", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Give me a prompt" }));
    const shown = PROMPTS.filter((p) => screen.queryByText(p));
    expect(shown).toHaveLength(1);
    expect((screen.getByLabelText("Journal page") as HTMLTextAreaElement).value).toBe("");
  });

  it("an edit is a new version of the same entry: a save op with a new id, never an update", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const page = screen.getByLabelText("Journal page") as HTMLTextAreaElement;
    expect(page.value).toBe("invented second words");
    fireEvent.change(page, { target: { value: "invented second words, amended" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new version" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe("/api/journal");
    expect(posts[0].body).toMatchObject({ op: "save", entry_id: ID(4), body: "invented second words, amended" });
    expect(posts[0].body.id).not.toBe(ID(5));
    expect(posts[0].body.id).not.toBe(ID(6));
    // History is listed.
    expect(screen.getByText("2 versions")).toBeTruthy();
  });

  it("keeps an unsent draft in this browser, and does not let Edit overwrite typed words", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Journal page"), { target: { value: "invented draft" } });
    expect(window.localStorage.getItem(`grid.draft.${localDay()}`)).toBe("invented draft");
    expect((screen.getByRole("button", { name: "Edit" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("meditation", () => {
  it("runs a sitting, shows the text count (CSS hides it when motion is allowed), and logs it finished", async () => {
    vi.useFakeTimers();
    render(createElement(Today));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByText("Sample task one")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "1 min" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Begin" }));
    });
    const dialog = screen.getByRole("dialog", { name: "Meditation" });
    expect(within(dialog).getByText("1:00")).toBeTruthy();
    expect(dialog.querySelector(".grid-count")?.textContent).toMatch(/Breathe in\s*1/);
    expect(dialog.querySelector(".grid-circle")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(within(dialog).getByText("Done")).toBeTruthy();
    const log = posts.find((p) => p.url === "/api/meditation");
    expect(log?.body).toMatchObject({ op: "log", day: localDay(), planned_seconds: 60, elapsed_seconds: 60, finished: true });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ending early logs the sitting as not finished, and a failed log is not shown as logged", async () => {
    vi.useFakeTimers();
    render(createElement(Today));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    failPosts = true;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Begin" }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "End early" }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    const log = posts.find((p) => p.url === "/api/meditation");
    expect(log?.body).toMatchObject({ finished: false, planned_seconds: 300, elapsed_seconds: 5 });
    expect(screen.getByText("Meditation session (ended early)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
