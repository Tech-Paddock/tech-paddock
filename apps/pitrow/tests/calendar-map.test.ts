import { describe, expect, it } from "vitest";
import { APP, choreEvent, choreGone, sendQuietly } from "@/lib/calendar-map";

const chore = { id: "c1", title: "Bins", cadence: "daily" as const, weekdays: null, every_n: null, start_on: "2026-11-24" };

describe("a chore as a calendar event", () => {
  it("is all-day, sent as pit-row with the chore's id, its title and nothing else of anyone's", () => {
    expect(choreEvent(chore)).toEqual({ app: "pit-row", source_id: "c1", op: "upsert", title: "Bins", all_day: true, start: "2026-11-24", recurrence: { freq: "daily" } });
    expect(APP).toBe("pit-row");
  });
  it("once has no recurrence; every N days is a daily interval", () => {
    expect(choreEvent({ ...chore, cadence: "once" })).not.toHaveProperty("recurrence");
    expect(choreEvent({ ...chore, cadence: "every_n", every_n: 3 })).toMatchObject({ recurrence: { freq: "daily", interval: 3 } });
  });
  it("weekly starts on its first weekday on or after the start, and names its days", () => {
    // 2026-11-24 is a Tuesday; Thursday and Saturday are 4 and 6.
    expect(choreEvent({ ...chore, cadence: "weekly", weekdays: [6, 4] })).toMatchObject({
      start: "2026-11-26",
      recurrence: { freq: "weekly", days_of_week: ["thursday", "saturday"] },
    });
  });
  it("retiring is a delete of the same id", () => {
    expect(choreGone("c1")).toEqual({ app: "pit-row", source_id: "c1", op: "delete" });
  });
});

describe("sendQuietly", () => {
  it("swallows a calendar that is down", async () => {
    expect(await sendQuietly(async () => { throw new Error("down"); }, choreGone("c1"))).toBe(false);
    expect(await sendQuietly(async () => ({ ok: false }), choreGone("c1"))).toBe(false);
    expect(await sendQuietly(async () => ({ ok: true }), choreGone("c1"))).toBe(true);
  });
});
