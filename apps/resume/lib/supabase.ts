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

function clientFor(schema: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  return createClient(url, key, { auth: { persistSession: false }, db: { schema } });
}

// Same project, different schema. The Resume Formatter is the submission layer:
// filling in the job details when saving a render creates or updates the thread
// the Pipeline Tracker displays. The tracker keeps its own ad-hoc creation for
// applications and networking threads that never involve a resume.
export const getTrackerClient = () => clientFor("tracker");

// Shared contacts, so the person you sent a resume to exists once rather than
// as a duplicate of the record the Message Editor already knows.
export const getSharedClient = () => clientFor("shared");
