/**
 * Save an entry, then what follows it (a training's treats, TEC-136; a vet
 * visit's weight, TEC-151). The followers are saved only once the entry is: if
 * it fails, none is, so nothing is ever logged for an entry that never was. The
 * screen keeps the followers on the failed row; Retry runs this again with
 * them, and ✕ drops them with it.
 *
 * `saveOne` returns whether the entry saved (it shows its own failure).
 * `saveNext` hands a follower off as an entry of its own, with its own row and
 * its own Retry, so one failed follower never holds up another.
 */
export async function saveThen<B>(
  saveOne: (body: B) => Promise<boolean>,
  saveNext: (body: B) => void,
  body: B,
  then?: readonly B[]
): Promise<boolean> {
  if (!(await saveOne(body))) return false;
  for (const t of then ?? []) saveNext(t);
  return true;
}
