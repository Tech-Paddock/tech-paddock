import { createClient } from "@supabase/supabase-js";

/**
 * Every database request leaves with `cache: "no-store"`: Next patches the
 * server's `fetch` and keeps GET responses in its Data Cache, and a day read
 * empty in the morning must not stay empty after a task is saved. Here rather
 * than per route so a route added later cannot forget it.
 */
export const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

/**
 * The one 401 that is retried: Supabase's gateway mints a short-lived token per
 * request, and a backend whose clock runs slightly behind rejects it as "JWT
 * issued at future". The next request succeeds. Any other 401 (a real
 * credentials failure) passes through untouched, so a wrong key still shows.
 */
export const JWT_FUTURE = "JWT issued at future";
export const RETRY_PAUSE_MS = 300;

async function isJwtFuture(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    return (await res.clone().text()).includes(JWT_FUTURE);
  } catch {
    return false;
  }
}

/** Retries a request once, after a short pause, on 401 "JWT issued at future". A 401 is rejected before PostgREST runs it, so a write is safe to resend. */
export const retryingFetch: typeof fetch = async (input, init) => {
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
    db: { schema: "pitrow" },
    global: { fetch: retryingFetch },
  });
}
