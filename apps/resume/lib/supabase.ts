import { createClient } from "@supabase/supabase-js";

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
    db: { schema: "resume" },
  });
}

// There is deliberately no client for `shared` here (TEC-26). One used to be
// exported with a comment claiming it kept contacts deduplicated; nothing ever
// called it, so the claim described a guarantee nobody provided. Reaching
// `shared` from here is a contract change that goes to the owner through the
// technical director.
//
// There is no client for `tracker` either. The Pipeline Tracker was retired on
// 2026-10-20; this app reads and writes only the `resume` schema.
