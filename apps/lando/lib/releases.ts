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
  "2026-11-08": "Adding a medication works, a medication now carries a reason, there is a Calendar, and saving now asks when.",
  "2026-11-02": "The top boxes open a quick entry again, the form boxes line up, and a Health or Training entry can point to a note.",
  "2026-11-01": "Tidier forms, one Potty button, a Medication tab, and plans for the days ahead.",
  "2026-10-30": "A snuffle mat counts as half a meal.",
  "2026-10-29": "Royal Canin Dachshund Puppy joins the meal list, and you can add your own foods.",
  "2026-10-28": "The top boxes are now the way in, logging a potty got quicker, and the Log buttons are tidier.",
  "2026-10-27": "Quick entries from the top boxes, colour in the feed, and time outside.",
  "2026-10-26": "Analytics rebuilt, Fun and Training split out, and plenty of small improvements.",
  "2026-10-25": "A Health button for vet visits and medical issues.",
  "2026-10-21": "Lando's puppy journal goes live.",
};

export const RELEASES: readonly Release[] = [
  { date: "2026-11-08", text: "Saving now asks when. The When box is gone from the top of every form: press Save and a short step opens with a big Now button, or pick another date and time and Save it there. A time in the future still saves as an upcoming plan, and the step says so. A correction opens the step on the entry's own time, and Back to the form closes it. Logging as moves to the bottom, beside Save, on every form. The Meals box now reads just Meals: 2, with no cups. On Training, Related note sits beside Treats on one line, and on a vet visit or a medication dose, Related issue and Related note sit side by side." },
  { date: "2026-11-08", text: "The Log is quieter. Next 7 days is now one short line per plan, with its name, when it is due (red if it is late) and a small Done, and a Calendar link beside the heading; tap a plan to change it. On Potty, Training and Fun, Treats is a plain minus, number and plus with no boxes, and on Potty Medical issue is its own tick box beside it, with Related issue opening under it as before. Attaching is smaller everywhere, on every form, plan and note: tap the small Attach link to take a photo or choose files, see them as small thumbnails, and tap one to open or remove it." },
  { date: "2026-11-08", text: "There is a new Calendar tab after Log. It shows a month that you can swipe or step with the arrows, with today marked. Under each day, a filled dot is something you logged and a ring is something planned, in the same colours as the feed. Tap a day to see its plans and what was logged: a plan can be marked Done or changed, and a logged entry opens to correct or delete. On today or any later day, Add a plan asks what kind and opens that form on the day you picked. Notes never show in the Calendar." },
  { date: "2026-11-08", text: "A medication now has a reason: Heartworm, Flea & tick, Dewormer, Allergy, Pain, Antibiotic, Joint or Other. Pick one when you add a medication. Medications you added before show No reason until you set one on the Medication tab, and a reason can be set once. Every dose in the Log shows its medication's reason, and Analytics has a new Medication by reason card." },
  { date: "2026-11-08", text: "Adding a medication now works." },
  { date: "2026-11-02", text: "A vet visit, medical issue, medication or training entry can now point to one of your notes: pick it under Related note, or leave it on None. On a vet visit or a medication, the Related issue list is always there, with no tick box to open it first. Potty keeps its Medical issue tick box. Notes still never show in the Log feed, the top boxes or Analytics." },
  { date: "2026-11-02", text: "There is a new Notes tab after Log for anything that is not a potty or a meal: a reminder, something the vet said, or a document. Tap Add note, write it, and attach up to 6 photos or files such as a PDF. Notes are listed newest first with who wrote them, long ones show two lines until you tap them, and a file opens when you tap its name. Tap Edit on a note to change or delete it. Notes never show in the Log feed, the top boxes or Analytics." },
  { date: "2026-11-02", text: "Every form, Food and Weight included, and every upcoming item can now carry up to 6 photos or files, such as a PDF from the vet. Take photo is still there, and Attach opens the phone's file picker for anything. Photos are still shrunk first; other files can be up to 4 MB, and a bigger one says so on the form. Photos show as thumbnails and other files as a tag with their name, which opens the file when tapped. Tapping an item in Next 7 days or the Upcoming list now opens it to change anything, and its row reads the title and note together on one line. When you mark an item done, its photos and files come along to the entry." },
  { date: "2026-11-02", text: "The top boxes are tappable again. Pee and Poop open Potty with that one picked, Meals opens Food, and Fun opens Fun. The Log buttons are back to Treats, Training, Weight and Health, and the Potty, Food and Fun buttons are gone." },
  { date: "2026-11-02", text: "The boxes on the forms now sit side by side as meant. On Health's Medication tab, the dose no longer covers the medication, and Medication, Dose and Unit share one line. When is only as wide as it needs to be and matches Logging as in height, and the Food form's Amount box is smaller." },
  { date: "2026-11-01", text: "The tabs are now Log, Analytics and Patch notes. What's new has a new name, and the Upcoming tab is gone: anything planned for later now lives in the Log." },
  { date: "2026-11-01", text: "Pick a time in the future on any form and it saves as something coming up instead of an entry. You can repeat it every few weeks, months or years. A Next 7 days box under the top boxes shows what is due this week, in amber when it is close and red when it is late, and an Upcoming choice in the feed lists everything coming up. Done opens the form it came from, filled in, and closes the item once you save." },
  { date: "2026-11-01", text: "Health has a Medication tab beside Vet visit and Medical issue. Pick a medication, say how much and how it was given, and every dose shows in the feed. Add a new medication from the list any time." },
  { date: "2026-11-01", text: "Treats on Potty, Training and Fun are now a simple count with minus and plus buttons. Anything above zero is logged as its own treat, and Food still lets you pick a specific treat." },
  { date: "2026-11-01", text: "There is one Potty button with nothing preset, so you choose what happened each time. The Log buttons are now Potty, Food, Training, Fun, Weight and Health, and the top boxes only show their numbers, so tapping them no longer opens a form." },
  { date: "2026-11-01", text: "Every form is tidier and tighter: When and Logging as share the first box, the entry sits in its own box, and treats and medical issue sit together in a third. Buttons and boxes are smaller, Where and Leash share a line, and the note is a two-line box." },
  { date: "2026-10-30", text: "A snuffle mat now counts as half a meal on the Meal box, so a meal and a snuffle mat read Meals: 1½. The cups still add in full." },
  { date: "2026-10-29", text: "Snuffle mat is now its own type on the Food form, beside Meal and Treat. It picks from the meal list, shows in the feed as Snuffle mat, and counts as a meal: on the Meal box, in the time since the last meal and in the meal gaps. The old Snuffle mat item has left the meal list, and older entries still read and can be corrected." },
  { date: "2026-10-29", text: "The Meal box at the top now reads Meals with today's count and the cups eaten, like Meals: 2 · 1⅛ cups, in eighth-cup steps. Only meals logged in cups add to the cups, and the box still shows the time since the last meal and opens a quick entry when tapped." },
  { date: "2026-10-29", text: "Meals today is gone from the top bar, and time outside is now picked in ranges, from 5 minutes or less up to 45 to 60. The amount box on the food form is smaller, and Snuffle mat is on the meal list. Training has its time at the top beside Inside and Outside, commands are picked from a list, and Training and Potty both have a treat and how many right in the form." },
  { date: "2026-10-29", text: "There is a new Upcoming tab for vet visits, vaccines, medications and anything else coming up. Add what is due and when, and it can repeat every few weeks, months or years. Items due within a week turn amber and overdue ones turn red, and the next one shows under the top boxes on Log. Tap Done on a vet visit or vaccine to log the visit, and it is ticked off once the visit is saved." },
  { date: "2026-10-29", text: "Royal Canin Dachshund Puppy is now on the meal list. On the Food form, pick Add a food at the bottom of the list to add a new meal or treat with its name and unit, and the calories if you know them. It is picked for you, and nothing is logged until you save." },
  { date: "2026-10-28", text: "The Log buttons now sit in one row right under the top boxes, and Logging as moves down above the feed. A treat's amount is a plain number, the What box is back to a normal size, time outside fits on one row, and on the iPhone app the top of the page sits a little lower so nothing slides behind the clock." },
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
