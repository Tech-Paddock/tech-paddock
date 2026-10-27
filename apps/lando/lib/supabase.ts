import { createClient } from "@supabase/supabase-js";

/**
 * Every database request leaves with `cache: "no-store"` (TEC-113).
 *
 * Next 14 patches the server's `fetch` and keeps GET responses in its Data
 * Cache unless something opts out. **`dynamic = "force-dynamic"` does not**:
 * on a route handler it only makes the handler run per request, and the opt-out
 * Next applies by itself goes to routes that also export a POST, PUT, PATCH or
 * DELETE. So Health's `/api/day`, which exported GET alone, ran every time and answered
 * every time from the first read of that date — a day read empty in the
 * morning stayed empty after every meal was saved, while `/api/targets`, which
 * also exports POST, read live. Nothing errored, and a saved meal looked
 * exactly like a failed one.
 *
 * Here rather than per route because the rule is "no database read is ever a
 * cached one", and a route added later must not have to remember it.
 */
export const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

/**
 * The one 401 that is retried (TEC-175). Supabase's gateway mints a short-lived
 * token per request, and a backend whose clock runs slightly behind the
 * gateway's rejects it as "JWT issued at future". It is intermittent, it hits
 * one of several concurrent reads, and the next request succeeds. Clock drift
 * inside Supabase is not ours to fix, so the request is sent once more.
 *
 * Any other 401 (a real credentials failure) and every other status passes
 * through untouched, so a wrong key still shows.
 */
export const JWT_FUTURE = "JWT issued at future";
export const RETRY_PAUSE_MS = 300;

async function isJwtFuture(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    // A clone, so the caller's copy of the body is never consumed.
    return (await res.clone().text()).includes(JWT_FUTURE);
  } catch {
    return false;
  }
}

/**
 * Retries a request exactly once, after a short pause, when Supabase answers
 * 401 "JWT issued at future"; the second response is returned as it is.
 * A 401 is rejected before PostgREST runs the request, so a write is safe to
 * resend (and `writeEvent` is idempotent on `id` anyway).
 */
export const retryingFetch: typeof fetch = async (input, init) => {
  // A Request's body can be read once, so keep a clone to send again.
  const again = input instanceof Request ? input.clone() : input;
  const res = await noStoreFetch(input, init);
  if (!(await isJwtFuture(res))) return res;
  await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
  return noStoreFetch(again, init);
};

// Server-side only: uses the service role key, which bypasses RLS.
// Never import this file from a client component.
export function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: "lando" },
    global: { fetch: retryingFetch },
  });
}
