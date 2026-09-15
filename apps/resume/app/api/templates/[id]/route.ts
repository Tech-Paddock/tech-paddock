import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { StorageError, removeDocx } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Change one template: activate it, archive it, or bring it back.
 *
 * Activating and archiving are opposites by definition — an archived template is
 * hidden from the list, so activating one would pin the renderer to something
 * you can no longer see. The database enforces that too.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const wantsActive = body?.is_active === true;
  const wantsArchived = typeof body?.archived === "boolean";

  if (!wantsActive && !wantsArchived) {
    return fail(400, "unsupported", "Supported changes are activating a template, or archiving and restoring one.");
  }
  if (wantsActive && wantsArchived) {
    return fail(400, "unsupported", "Activate or archive, not both in one call.");
  }

  const supabase = getServiceClient();

  // Confirm the target exists first. Clearing the current active for an id that
  // turns out not to exist would leave nothing active and break rendering.
  const { data: target, error: findError } = await supabase
    .from("templates")
    .select("id, is_active, archived_at")
    .eq("id", params.id)
    .maybeSingle();
  if (findError) return fail(500, "db_error", findError.message);
  if (!target) return fail(404, "not_found", "No template with that id.");

  if (wantsArchived) return setArchived(params.id, target, body.archived as boolean);

  if (target.archived_at) {
    return fail(409, "archived", "That template is archived. Restore it before making it active.");
  }

  const { error: clearError } = await supabase.from("templates").update({ is_active: false }).eq("is_active", true);
  if (clearError) return fail(500, "db_error", clearError.message);

  const { data, error } = await supabase
    .from("templates")
    .update({ is_active: true })
    .eq("id", params.id)
    .select(SELECT)
    .maybeSingle();

  if (error) return fail(500, "db_error", error.message);
  if (!data) return fail(404, "not_found", "No template with that id.");
  return NextResponse.json({ template: data });
}

/** Archiving the active template would leave nothing active and /api/reformat
 *  refuses to run without one, so that is refused rather than silently allowed. */
async function setArchived(id: string, target: { is_active: boolean }, archived: boolean) {
  if (archived && target.is_active) {
    return fail(409, "active_template", "That is the active template. Make another one active before archiving it.");
  }

  const { data, error } = await getServiceClient()
    .from("templates")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select(SELECT)
    .maybeSingle();

  if (error) return fail(500, "db_error", error.message);
  if (!data) return fail(404, "not_found", "No template with that id.");
  return NextResponse.json({ template: data });
}

/**
 * Delete a template outright.
 *
 * Only ever permitted for a template no render points at. `renders.template_id`
 * is a not-null foreign key with no delete action, so the database would refuse
 * anyway — this checks first to return a sentence explaining the alternative
 * instead of a foreign key violation.
 *
 * This is the duplicate-upload case and nothing wider: a template with renders
 * behind it is the record of what was actually sent to somebody, and archiving
 * is how that one leaves the list.
 */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServiceClient();

  const { data: target, error: findError } = await supabase
    .from("templates")
    .select("id, version, is_active, file_path")
    .eq("id", params.id)
    .maybeSingle();
  if (findError) return fail(500, "db_error", findError.message);
  if (!target) return fail(404, "not_found", "No template with that id.");

  if (target.is_active) {
    return fail(409, "active_template", "That is the active template. Make another one active before deleting it.");
  }

  const { count, error: countError } = await supabase
    .from("renders")
    .select("id", { count: "exact", head: true })
    .eq("template_id", params.id);
  if (countError) return fail(500, "db_error", countError.message);

  if ((count ?? 0) > 0) {
    return fail(
      409,
      "has_renders",
      `${count} render${count === 1 ? "" : "s"} were built from v${target.version}, and each one is the record of what was actually sent. Archive it instead — it leaves the list and the history stays intact.`
    );
  }

  const { error } = await supabase.from("templates").delete().eq("id", params.id);
  if (error) return fail(500, "db_error", error.message);

  // Row first, then the object. The reverse leaves a row pointing at bytes that
  // are gone, which breaks the download; this way a failure here only strands an
  // object nothing references.
  if (target.file_path) {
    try {
      await removeDocx(target.file_path as string);
    } catch (err) {
      if (!(err instanceof StorageError)) throw err;
      // The template is gone as far as the app is concerned. Say so rather than
      // reporting a failure the user cannot act on and would retry pointlessly.
      console.error("template row deleted but its file remains", target.file_path, err);
    }
  }

  return NextResponse.json({ deleted: params.id });
}

const SELECT = "id, version, name, spec, is_active, archived_at, created_at";

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ code, error }, { status });
}
