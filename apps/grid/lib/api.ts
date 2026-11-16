import { NextResponse } from "next/server";
import { DbError, NotFound } from "./db";
import { Invalid } from "./validate";

/**
 * One shape for every write route: read the body, parse it, run it, answer
 * `{ ok: true }`. A failure answers with a short message that never carries
 * what was typed, and nothing is logged (a body can be a journal entry).
 * The browser shows anything but `ok` as "not saved" with a Retry.
 */
export function failure(e: unknown): NextResponse {
  if (e instanceof Invalid) return NextResponse.json({ error: e.message }, { status: 400 });
  if (e instanceof NotFound) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (e instanceof DbError) return NextResponse.json({ error: "Could not save. Try again." }, { status: 500 });
  return NextResponse.json({ error: "Could not save. Try again." }, { status: 500 });
}

export async function handleWrite<T>(request: Request, parse: (body: unknown) => T, run: (parsed: T) => Promise<void>) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure(new Invalid("Expected JSON"));
  }
  try {
    await run(parse(body));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
