import type { getServiceClient } from "@/lib/supabase";

/**
 * Make one template the active one, in a single database transaction.
 *
 * `resume.activate_template` (the resume_activate_template migration) clears
 * the previous active template and sets this one together. It used to be two
 * PostgREST updates, and a failure between them left no template active, which
 * stops /api/reformat outright. It cannot be one update: the partial unique
 * index allowing a single active row is checked row by row as an UPDATE runs.
 *
 * `data` is the activated row, or null when no template has that id — in which
 * case the function changed nothing. Activating an archived template is refused
 * by the table's check constraint and rolls back whole; callers check for that
 * first so the user gets a sentence rather than a constraint name.
 */
export async function activateTemplate(supabase: ReturnType<typeof getServiceClient>, id: string, columns: string) {
  return supabase.rpc("activate_template", { template_id: id }).select(columns).maybeSingle();
}
