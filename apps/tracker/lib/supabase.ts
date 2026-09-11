import { createClient } from "@supabase/supabase-js";

// Server-side only: uses the service role key, which bypasses RLS.
// Never import this file from a client component.
function clientFor(schema: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
    db: { schema },
  });
}

export function getServiceClient() {
  return clientFor("tracker");
}

// Same project, shared schema — for reading/writing contacts.
export function getSharedClient() {
  return clientFor("shared");
}

// The dashboard derives last touch from what actually happened, not from a date
// typed in by hand, so it has to read the evidence the other two tools record:
// messages actually sent, resumes actually submitted. Read-only in both cases.
// This mirrors the Resume Formatter, which already reads the tracker schema the
// same way rather than going over HTTP for a cross-tool read.
export const getEditorClient = () => clientFor("editor");
export const getResumeClient = () => clientFor("resume");
