/**
 * The release notes behind the What's new tab (TEC-182): one plain sentence
 * for each change a user would notice, newest first. Written for someone who
 * uses the app, not for someone who builds it: what they can do now, with no
 * issue numbers, file names or jargon, and no real names (RULES.md, Never 2).
 *
 * Append-only, like the journal. Add the new entry at the TOP in the same
 * branch as the change; never rewrite an old one. A new day also gets its
 * one-line summary in `DAY_SUMMARIES` (TEC-186). The tab shows the newest
 * `DAYS_SHOWN` whole days; older entries stay here.
 */
export type Release = {
  /** The day it went live, YYYY-MM-DD. */
  date: string;
  /** One short, plain sentence. */
  text: string;
};

/** How many whole days the tab shows, newest first. */
export const DAYS_SHOWN = 7;

/**
 * One short, plain line per day that has entries: what the day was about. The tab reads
 * "Oct 27 | <this line>" and then the day's entries as bullets. Newest first; a summary,
 * once written, is not rewritten.
 */
export const DAY_SUMMARIES: Readonly<Record<string, string>> = {
  "2026-10-28": "The top boxes are now the way in, and logging a potty got quicker.",
  "2026-10-27": "Quick entries from the top boxes, colour in the feed, and time outside.",
  "2026-10-26": "Analytics rebuilt, Fun and Training split out, and plenty of small improvements.",
  "2026-10-25": "A Health button for vet visits and medical issues.",
  "2026-10-21": "Lando's puppy journal goes live.",
};

export const RELEASES: readonly Release[] = [
  { date: "2026-10-28", text: "The box at the top that said Exercise is now Fun. It counts walks and playtime only, and tapping it opens a new Fun entry." },
  { date: "2026-10-28", text: "The Log buttons are now Treats, Training, Weight and Health. Treats opens the food form on a treat, and Potty and Fun are reached from the top boxes." },
  { date: "2026-10-28", text: "The lines of meal timing under the top boxes are gone." },
  { date: "2026-10-28", text: "On a new Fun entry, tap Pee or Poop to log a potty trip right away. A walk or play outside counts as normal, and play inside counts as an accident." },
  { date: "2026-10-28", text: "Time outside is picked from buttons only, from 5 minutes or less up to 60, and the number box is gone." },
  { date: "2026-10-28", text: "Outside potty trips can now say In box, and inside ones can say Box. Older entries that say pen or crate still read as before." },
  { date: "2026-10-28", text: "This page is now plain text: a line for each day, then that day's updates." },
  { date: "2026-10-27", text: "Tap the Pee, Poop or Meal box at the top and a quick entry opens with the usual answers already filled in." },
  { date: "2026-10-27", text: "Each kind of entry has its own colour in the feed, and you can show more than one kind at a time." },
  { date: "2026-10-27", text: "When you log a potty trip outside, you can tap how many minutes it took." },
  { date: "2026-10-27", text: "Feed rows now say Pee, Poop, Both or No potty, so you can tell at a glance." },
  { date: "2026-10-27", text: "Fixed a rare glitch where the journal sometimes failed to load." },
  { date: "2026-10-26", text: "Photos can go on any entry, and the top boxes show the time between a meal and the pee, poop or next meal." },
  { date: "2026-10-26", text: "The feed filter now looks different from the Log buttons, so the two are harder to mix up." },
  { date: "2026-10-26", text: "An accident inside now records where it happened: crate, pen or loose." },
  { date: "2026-10-26", text: "A vet visit or potty trip can be linked to a medical issue, the top boxes change colour as time passes, and the bar counts today's meals." },
  { date: "2026-10-26", text: "Health entries are now one simple pick plus a note about what happened." },
  { date: "2026-10-26", text: "You can filter the feed by kind, log a trip with nothing done as No potty, and add a new dog friend right from the form." },
  { date: "2026-10-26", text: "Potty trips can say whether the pup was on a leash, and exercise can say which dog friends came along." },
  { date: "2026-10-26", text: "The Log screen is more compact, so more fits on the phone." },
  { date: "2026-10-26", text: "A vet visit can record the pup's weight too." },
  { date: "2026-10-26", text: "The day-by-day view in Analytics shows the last five days." },
  { date: "2026-10-26", text: "Analytics was rebuilt: a day-by-day view of potty trips and meals, and how long after a meal the poop usually comes." },
  { date: "2026-10-26", text: "Fun and Training got their own buttons, the feed is grouped day by day, and meal amounts are picked on a scroller." },
  { date: "2026-10-26", text: "The app icon is now the pup in a racing helmet." },
  { date: "2026-10-25", text: "A new Health button logs vet visits and medical issues, with photos." },
  { date: "2026-10-21", text: "Lando's puppy journal is live: log pee, poop, meals, exercise and weight, and see how long since the last one." },
];

export type ReleaseDay = { date: string; summary: string; items: string[] };

/**
 * The days the tab shows: whole days, newest first, each with its summary and its entries in
 * the order written. A day with no summary reads with an empty one (a test forbids it).
 */
export function shownDays(
  list: readonly Release[] = RELEASES,
  summaries: Readonly<Record<string, string>> = DAY_SUMMARIES,
  days: number = DAYS_SHOWN
): ReleaseDay[] {
  const out: ReleaseDay[] = [];
  for (const r of list) {
    let day = out.find((d) => d.date === r.date);
    if (!day) {
      if (out.length >= days) break;
      day = { date: r.date, summary: summaries[r.date] ?? "", items: [] };
      out.push(day);
    }
    day.items.push(r.text);
  }
  return out;
}
