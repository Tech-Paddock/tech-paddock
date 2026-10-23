/**
 * What the list's add box holds, as items: **one per line** (owner,
 * 2026-10-23: "Keep multi-line paste"). Trimmed; blank lines dropped; a
 * Windows line ending is a line ending. No imports, so the browser runs it.
 */
export function typedLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}
