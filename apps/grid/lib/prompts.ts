/**
 * The journal's prompts: one fixed list, in the code (RULES.md, Surface). A
 * prompt is shown above the page and never written into it. No model is
 * called (Never 3).
 */
export const PROMPTS: readonly string[] = [
  "What is one thing that went better than you expected today?",
  "What is taking up the most room in your head right now?",
  "What would make tomorrow feel like a good day?",
  "Name three small things you are glad of.",
  "What did you avoid today, and what would a first step look like?",
  "What did you learn this week that you want to keep?",
  "Who are you grateful for, and what did they do?",
  "What is one thing you are carrying that you could put down?",
  "How does your body feel right now, and what does it want?",
  "What are you looking forward to?",
  "Describe a moment from today in detail.",
  "What would you tell a friend who felt the way you do today?",
  "What is one thing you want to do more of, and one thing less?",
  "What did you do today that you are proud of, however small?",
];

/** A prompt other than the one just shown. `rand` is injectable for tests. */
export function nextPromptIndex(previous: number | null, rand: () => number = Math.random): number {
  const n = PROMPTS.length;
  if (n < 2) return 0;
  let i = Math.min(n - 1, Math.floor(rand() * n));
  if (i === previous) i = (i + 1) % n;
  return i;
}
