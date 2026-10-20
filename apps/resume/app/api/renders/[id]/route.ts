import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { StorageError, downloadDocx, removeDocx } from "@/lib/storage";
import { DocxReadError, readDocxParts } from "@/lib/docx/read";
import { extractParagraphs } from "@/lib/docx/paragraphs";
import { auditAts, type AtsFinding } from "@/lib/docx/ats";
import { storedRenderView, type StoredRenderRow } from "@/lib/storedRender";

export const dynamic = "force-dynamic";

type Body = {
  submittedAt?: string | null;
};

/**
 * Reopen a stored render: its verdict, coverage and change log, as written.
 *
 * Coverage and the change log are read back from the row — never recomputed —
 * because they are the record of what this render did. The ATS findings were
 * never stored, so they are read off the stored output bytes: the document that
 * went out, audited by today's lint. Whether a verdict can be given at all is
 * decided in `lib/storedRender.ts`.
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = getServiceClient();

  const { data: render, error } = await supabase
    .from("renders")
    .select("id, template_id, template_snapshot, parsed_content, coverage, output_file_path, submitted_at")
    .eq("id", params.id)
    .maybeSingle();
  if (error) return fail(500, "db_error", error.message);
  if (!render) return fail(404, "not_found", "No render with that id.");
  const outputPath = typeof render.output_file_path === "string" && render.output_file_path ? render.output_file_path : null;
  // A render that FAILed stores no output (TEC-105) but does store the findings
  // it was judged on, so it reopens from those rather than reading as a PASS
  // with no findings. With neither, there is nothing honest to show.
  const storedFindings = recordedFindings(render.template_snapshot);
  if (outputPath === null && storedFindings === null) {
    return fail(409, "no_output", "This render has no stored output, so there is nothing to reopen.");
  }

  let template: { name: string; version: number } | null = null;
  if (render.template_id) {
    const { data, error: templateError } = await supabase
      .from("templates")
      .select("name, version")
      .eq("id", render.template_id)
      .maybeSingle();
    if (templateError) return fail(500, "db_error", templateError.message);
    if (data) template = { name: data.name as string, version: data.version as number };
  }

  if (outputPath === null) {
    return NextResponse.json(
      storedRenderView({ render: render as StoredRenderRow, template, findings: storedFindings ?? [] })
    );
  }

  try {
    const parts = await readDocxParts(Buffer.from(await downloadDocx(outputPath)));
    const findings = auditAts(parts, extractParagraphs(parts.document));
    return NextResponse.json(storedRenderView({ render: render as StoredRenderRow, template, findings }));
  } catch (err) {
    if (err instanceof StorageError) return fail(502, "storage_error", err.message);
    if (err instanceof DocxReadError) return fail(422, err.code, err.message);
    throw err;
  }
}

/** The ATS findings a render recorded when it ran, or null if it recorded none
 *  or they cannot be read. */
function recordedFindings(snapshot: unknown): AtsFinding[] | null {
  if (typeof snapshot !== "object" || snapshot === null) return null;
  const findings = (snapshot as { findings?: unknown }).findings;
  if (!Array.isArray(findings)) return null;
  const ok = findings.every(
    (f) =>
      typeof f === "object" &&
      f !== null &&
      typeof (f as AtsFinding).code === "string" &&
      ((f as AtsFinding).severity === "blocking" || (f as AtsFinding).severity === "warning") &&
      typeof (f as AtsFinding).message === "string"
  );
  return ok ? (findings as AtsFinding[]) : null;
}

/**
 * Record when a render was sent.
 *
 * The document artifacts never change — parsed content, coverage and the file
 * are written once. Only `submitted_at` is editable, because a resume is
 * usually rendered days before it is actually sent. Where it was sent is not
 * recorded (the Pipeline Tracker that held it was retired on 2026-10-20).
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const body = ((await request.json().catch(() => null)) ?? {}) as Body;
  // Nothing else on a render is editable, so a body without it records nothing.
  if (body.submittedAt === undefined) return fail(400, "bad_request", "Send submittedAt: a timestamp, or null.");
  if (body.submittedAt !== null && (typeof body.submittedAt !== "string" || Number.isNaN(Date.parse(body.submittedAt)))) {
    return fail(400, "bad_request", "submittedAt must be a timestamp or null.");
  }
  const supabase = getServiceClient();

  const { data: render, error: loadError } = await supabase
    .from("renders")
    .select("id")
    .eq("id", params.id)
    .maybeSingle();
  if (loadError) return fail(500, "db_error", loadError.message);
  if (!render) return fail(404, "not_found", "No render with that id.");

  const { data, error } = await supabase
    .from("renders")
    .update({ submitted_at: body.submittedAt })
    .eq("id", params.id)
    .select("id, submitted_at")
    .single();

  if (error) return fail(500, "db_error", error.message);
  return NextResponse.json({ render: data });
}

/**
 * Delete a render, and the two files it points at.
 *
 * **Archiving is the normal way one leaves the list; this is for the test runs.**
 * Added on 2026-09-17, when fifteen of them were on screen, and only this much:
 * one at a time, no cascade, no bulk tool. Clearing test runs is a one-off, and
 * a click per render costs less than the machinery to delete in bulk.
 *
 * Row first, then the objects — the same order the template route uses, and for
 * the same reason. The reverse leaves a row pointing at bytes that are gone,
 * which breaks the download; this way a failure only strands an object nothing
 * references.
 */
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = getServiceClient();

  const { data: target, error: findError } = await supabase
    .from("renders")
    .select("id, source_file_path, output_file_path")
    .eq("id", params.id)
    .maybeSingle();
  if (findError) return fail(500, "db_error", findError.message);
  if (!target) return fail(404, "not_found", "No render with that id.");

  const { error } = await supabase.from("renders").delete().eq("id", params.id);
  if (error) return fail(500, "db_error", error.message);

  for (const path of [target.source_file_path, target.output_file_path]) {
    if (typeof path !== "string" || !path) continue;
    try {
      await removeDocx(path);
    } catch (err) {
      if (!(err instanceof StorageError)) throw err;
      // The render is gone as far as the app is concerned. Saying so beats
      // reporting a failure the user cannot act on and would retry pointlessly.
      console.error("render row deleted but its file remains", path, err);
    }
  }

  return NextResponse.json({ deleted: params.id });
}

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ code, error }, { status });
}
