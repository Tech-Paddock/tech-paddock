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

// There is deliberately no client for `shared` here (TEC-26). One used to be
// exported with a comment claiming it kept contacts deduplicated; nothing ever
// called it, so the claim described a guarantee nobody provided. Under the
// `shared.contacts` contract in supabase/README.md the Message Editor is its
// only writer, and this app only passes a `contact_id` through to the tracker
// thread. A contact picker would be a read from the editor's list, never a
// write — and a new write path is a contract change that goes to Joel through
// the technical director.
