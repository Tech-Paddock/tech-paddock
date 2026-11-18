// @vitest-environment jsdom
// #73, the sixth change: the Time pop-up's hour, minute and AM/PM are Lando's own compact menus, not native selects. jsdom
// proves the roles, the tick, the keys and the closing; it cannot prove the size on an iPhone or the scroll inside the menu
// with a thumb: those are phone checks.
import { createElement, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import CompactMenu from "@/app/CompactMenu";
import { TimeField } from "@/app/WhenField";
import { dialog, menuBox, menuOptions, noDialog, optionText, pickMenu, timeBox } from "./whenpop";

afterEach(cleanup);

const HOURS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, text: String(i + 1) }));

function Harness({ onPick = () => {}, options = HOURS, start = 3 }: { onPick?: (v: number) => void; options?: { value: number; text: string; disabled?: boolean }[]; start?: number }) {
  const [v, setV] = useState(start);
  return createElement(
    "div",
    null,
    createElement("button", null, "outside"),
    createElement(CompactMenu<number>, {
      label: "Hour",
      value: v,
      options,
      onChange: (x: number) => {
        setV(x);
        onPick(x);
      },
    })
  );
}

const box = () => screen.getByRole("combobox", { name: "Hour" });
const listbox = () => screen.getByRole("listbox", { name: "Hour" });
const rows = () => within(listbox()).getAllByRole("option");

describe("the compact menu", () => {
  it("is a 44px box that shows the value, and opens a listbox of option rows right under it", () => {
    render(createElement(Harness));
    expect(box().className).toContain("min-h-[44px]");
    expect(box().textContent).toContain("3");
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(box());
    expect(box().getAttribute("aria-expanded")).toBe("true");
    expect(rows()).toHaveLength(12);
    expect(rows().map(optionText)).toEqual(HOURS.map((h) => h.text));
    // Directly under the box: the list is positioned from the box's own bottom edge.
    expect(listbox().className).toContain("top-full");
    expect(document.querySelector("select")).toBeNull();
  });

  it("is about five rows tall, scrolls inside itself and never the page, and cannot be selected", () => {
    render(createElement(Harness));
    fireEvent.click(box());
    const list = listbox();
    expect(list.style.maxHeight).toBe("198px"); // four and a half 44px rows: five in view, a sixth peeking
    expect(list.style.overscrollBehavior).toBe("contain");
    expect(list.className).toContain("overflow-y-auto");
    expect(list.className).toContain("select-none");
    expect(box().className).toContain("select-none");
  });

  it("ticks the current value", () => {
    render(createElement(Harness, { start: 7 }));
    fireEvent.click(box());
    const ticked = rows().filter((r) => r.getAttribute("aria-selected") === "true");
    expect(ticked.map(optionText)).toEqual(["7"]);
    expect(ticked[0].textContent).toContain("✓");
    expect(rows().filter((r) => r.textContent?.includes("✓"))).toHaveLength(1);
  });

  it("a tap picks the value and closes the menu", () => {
    const onPick = vi.fn();
    render(createElement(Harness, { onPick }));
    fireEvent.click(box());
    fireEvent.click(rows()[8]);
    expect(onPick).toHaveBeenCalledWith(9);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(box().textContent).toContain("9");
  });

  it("Escape closes it without picking, and a tap outside closes it too", () => {
    const onPick = vi.fn();
    render(createElement(Harness, { onPick }));
    fireEvent.click(box());
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(box());
    fireEvent.pointerDown(screen.getByText("outside"));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("the arrow keys move and Enter picks; Home and End jump; the box opens on an arrow", () => {
    const onPick = vi.fn();
    render(createElement(Harness, { onPick, start: 3 }));
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    const list = listbox();
    expect(list.getAttribute("aria-activedescendant")).toBe(rows()[2].id);
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(list.getAttribute("aria-activedescendant")).toBe(rows()[4].id);
    fireEvent.keyDown(list, { key: "ArrowUp" });
    fireEvent.keyDown(list, { key: "End" });
    expect(list.getAttribute("aria-activedescendant")).toBe(rows()[11].id);
    fireEvent.keyDown(list, { key: "Home" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("a greyed-out option is never picked, by tap or by key", () => {
    const onPick = vi.fn();
    const options = HOURS.map((h) => ({ ...h, disabled: h.value > 4 }));
    render(createElement(Harness, { onPick, options, start: 3 }));
    fireEvent.click(box());
    expect(rows()[5].getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(rows()[5]);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(listbox(), { key: "End" });
    expect(listbox().getAttribute("aria-activedescendant")).toBe(rows()[3].id); // the last one that can be picked
  });

  it("an option off the usual grid is just another row, and is ticked", () => {
    const options = [0, 5, 7, 10].map((m) => ({ value: m, text: `:${String(m).padStart(2, "0")}` }));
    render(createElement(Harness, { options, start: 7 }));
    fireEvent.click(box());
    expect(rows().map(optionText)).toEqual([":00", ":05", ":07", ":10"]);
    expect(rows()[2].getAttribute("aria-selected")).toBe("true");
  });
});

describe("the compact menus in the Time pop-up", () => {
  function Time({ onChange = () => {}, value = "2026-11-17T14:35" }: { onChange?: (v: string) => void; value?: string }) {
    return createElement(TimeField, { value, onChange });
  }

  it("Hour, Minute and AM or PM are compact menus with the current value ticked", () => {
    render(createElement(Time));
    fireEvent.click(timeBox());
    expect(menuBox("Hour").textContent).toContain("2");
    expect(menuBox("Minute").textContent).toContain(":35");
    expect(menuBox("AM or PM").textContent).toContain("PM");
    expect(menuOptions("Hour").ticked).toEqual(["2"]);
    expect(menuOptions("Minute").ticked).toEqual([":35"]); // :35 is on the grid; an off-grid one is covered below
    expect(menuOptions("AM or PM").ticked).toEqual(["PM"]);
  });

  it("an off-grid minute on an old entry still appears and is ticked", () => {
    render(createElement(Time, { value: "2026-10-19T21:34" }));
    fireEvent.click(timeBox());
    const m = menuOptions("Minute");
    expect(m.texts).toContain(":34");
    expect(m.ticked).toEqual([":34"]);
    expect(m.texts).toHaveLength(13);
  });

  it("nothing is applied until Done, and Cancel leaves the time as it was", () => {
    const onChange = vi.fn();
    render(createElement(Time, { onChange }));
    fireEvent.click(timeBox());
    pickMenu("Hour", "9");
    pickMenu("Minute", ":10");
    pickMenu("AM or PM", "AM");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    noDialog();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(timeBox());
    pickMenu("Hour", "9");
    pickMenu("Minute", ":10");
    pickMenu("AM or PM", "AM");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Done" }));
    expect(onChange).toHaveBeenCalledWith("2026-11-17T09:10");
  });

  it("Escape closes an open menu first, and the pop-up only on the next Escape", () => {
    render(createElement(Time));
    fireEvent.click(timeBox());
    fireEvent.click(menuBox("Hour"));
    expect(screen.getByRole("listbox", { name: "Hour" })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(dialog()).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" });
    noDialog();
  });

  it("the pop-up holds no native select, and its boxes are the app's 44px boxes", () => {
    render(createElement(Time));
    fireEvent.click(timeBox());
    expect(dialog().querySelector("select")).toBeNull();
    for (const name of ["Hour", "Minute", "AM or PM"]) expect(menuBox(name).className).toContain("min-h-[44px]");
  });
});
