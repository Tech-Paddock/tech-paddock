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
    global: { fetch: noStoreFetch },
  });
}
