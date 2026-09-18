"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LIVERY } from "@/lib/livery";
import { KIND_LABEL, type ResumeFile, type ResumeKind } from "@/lib/resumes";
import ThemeControl from "./ThemeControl";

/**
 * Three tabs, not four.
 *
 * Templates and History were two lists of the same thing — files this app is
 * holding — split by which table they happened to live in, which is the app's
 * business and not the reader's. They are one tab with a type filter now;
 * `/api/resumes` merges the view without merging the tables.
 *
 * **Reformat leads and is the landing tab.** Check led for a while on the
 * reasoning that formatting happens in Word and the last step before sending is
 * the one this app is for. That was wrong about how the app is actually opened:
 * it is opened to run a Jobright export through the house style, and Check is
 * where you go afterwards.
 */
type Tab = "reformat" | "resume" | "check";
const TABS: { id: Tab; label: string }[] = [
  { id: "reformat", label: "Reformat" },
  { id: "resume", label: "Resume" },
  { id: "check", label: "Check" },
];

/** The two retired tab names still resolve, so an old link lands somewhere sensible. */
const TAB_ALIASES: Record<string, Tab> = { templates: "resume", history: "resume" };

type Finding = { code: string; severity: "blocking" | "warning"; message: string };
/** How much of what the renderer took from the source reached the document. The
 *  name, contact block and static sections are not in that set — they come from
 *  the template on purpose — so this is not a percentage of the whole source. */
type Coverage = { totalLines: number; present: number; missing: string[]; percent: number };
type ChangeLogEntry = { section: string; detail: string; action: string };
type Reformatted = {
  filename: string;
  renderId: string | null;
  templateLabel: string;
  coverage: Coverage;
  findings: Finding[];
  changeLog: ChangeLogEntry[];
  summary: {
    experience: { company: string; title: string; date: string; bullets: number }[];
    highlights: number;
    competencies: number;
    hasSummary: boolean;
  };
  docxBase64: string;
};

type ContentCheck = { totalLines: number; present: number; missing: string[]; percent: number };

type Inspection = {
  filename: string;
  sizeBytes: number;
  paragraphCount: number;
  namedStyles: number;
  outline: {
    title: string | null;
    sections: { heading: string; lines: number; bullets: number; entries: number }[];
    preamble: string[];
  };
  findings: Finding[];
  /** Null until the document the text came from is attached too. */
  sourceFilename: string | null;
  content: ContentCheck | null;
};

const DOCX = ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/* ── pieces ──────────────────────────────────────────────────────────────── */

/**
 * The upload control, used for every file this app takes in.
 *
 * A drop target rather than a button: same pattern as Coffee's bag scanner, so
 * the two tools do not ask for a file in two different ways. The <label> wraps a
 * visually hidden input, which keeps the keyboard and screen-reader behaviour of
 * a real file input — a div with a click handler has neither.
 */
function FilePick({
  label,
  hint,
  file,
  onPick,
}: {
  label: string;
  hint: string;
  file: File | null;
  onPick: (f: File) => void;
}) {
  const [over, setOver] = useState(false);

  // Only ever the first file: every input here takes exactly one document, and
  // a multi-file drop silently using one of them would be a guess.
  const take = (list: FileList | null | undefined) => {
    const f = list?.[0];
    if (f) onPick(f);
  };

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
      className={`border border-dashed rounded-xl px-3 py-4 flex items-center gap-3 cursor-pointer transition-colors ${
        over ? "border-accent bg-accent/5" : "border-line bg-surface"
      }`}
    >
      <input
        type="file"
        accept={DOCX}
        className="sr-only"
        onChange={(e) => {
          take(e.target.files);
          // Clear it, or picking the same file twice fires no change event.
          e.target.value = "";
        }}
      />
      <span className="text-xl leading-none shrink-0" aria-hidden>
        📄
      </span>
      <span className="min-w-0">
        <span className="block text-[0.7rem] uppercase tracking-wide opacity-60">{label}</span>
        <span className={`block text-sm truncate ${file ? "font-medium" : "opacity-60"}`}>{file ? file.name : hint}</span>
      </span>
    </label>
  );
}

function Findings({ findings }: { findings: Finding[] }) {
  const blocking = findings.filter((f) => f.severity === "blocking");
  const warnings = findings.filter((f) => f.severity === "warning");
  if (findings.length === 0) {
    return (
      <p className="text-sm opacity-70">
        No structural problems. Single column, contact details in the body, no stray tables.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {[...blocking, ...warnings].map((f) => (
        <div
          key={f.code}
          className={`rounded-lg px-3 py-2 border text-sm ${
            f.severity === "blocking" ? "border-urgent text-urgent" : "border-warn text-warn"
          }`}
        >
          <p className="font-medium">
            {f.severity === "blocking" ? "Blocking" : "Warning"} · {f.code.replace(/_/g, " ")}
          </p>
          <p className="opacity-90">{f.message}</p>
        </div>
      ))}
    </div>
  );
}

/** A titled box. One shape for every block of content, so a screen reads as a
 *  page of panels rather than a stack of differently-styled cards. */
function Panel({ title, aside, children }: { title?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-surface border border-line rounded-xl overflow-hidden">
      {title && (
        <div className="flex items-baseline justify-between gap-3 px-4 py-2.5 border-b border-line">
          <h2 className="text-sm font-semibold">{title}</h2>
          {aside}
        </div>
      )}
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/** One number, read at a glance. The three of them replace three full-width
 *  paragraphs that each said one number. */
function Stat({ value, label, tone = "plain" }: { value: string; label: string; tone?: "plain" | "good" | "warn" }) {
  const colour = tone === "good" ? "text-accent" : tone === "warn" ? "text-warn" : "";
  return (
    <div className="bg-surface border border-line rounded-xl px-3 py-2.5">
      <p className={`text-xl font-semibold leading-tight ${colour}`}>{value}</p>
      <p className="text-[0.7rem] uppercase tracking-wide opacity-60">{label}</p>
    </div>
  );
}

/** Left rail, right work. One column below `lg`, which is also how it renders
 *  inside the hub's iframe — that width is the narrow case, not an edge case. */
function Workbench({ rail, children }: { rail: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)] items-start">
      <div className="flex flex-col gap-3 lg:sticky lg:top-4">{rail}</div>
      <div className="flex flex-col gap-4 min-w-0">{children}</div>
    </div>
  );
}

const KIND_STYLE: Record<ResumeKind, string> = {
  template: "border-accent text-accent",
  output: "border-line",
  input: "border-line opacity-70",
};

/* ── the app ─────────────────────────────────────────────────────────────── */

function ReformatShell() {
  const params = useSearchParams();
  const requestedTab = params.get("tab") ?? "";
  const highlightRender = params.get("render");

  const [tab, setTab] = useState<Tab>(
    TABS.some((t) => t.id === requestedTab) ? (requestedTab as Tab) : TAB_ALIASES[requestedTab] ?? "reformat"
  );

  const [files, setFiles] = useState<ResumeFile[] | null>(null);
  const [listStale, setListStale] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<ResumeKind | "all">("all");
  const [showArchived, setShowArchived] = useState(false);

  const [job, setJob] = useState({ company: "", role: "", jobUrl: "" });
  const [saved, setSaved] = useState<string | null>(null);
  const [template, setTemplate] = useState<File | null>(null);
  const [source, setSource] = useState<File | null>(null);
  const [single, setSingle] = useState<File | null>(null);
  const [checkSource, setCheckSource] = useState<File | null>(null);
  const [result, setResult] = useState<Reformatted | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * The list is a projection of the server, never a memory of it.
   *
   * It used to be two lists refreshed only on success, and on 2026-09-18 the
   * screen showed nine files while `resume.templates` held one row — every
   * delete had worked, and every one of them had left the row on screen, so the
   * next click on it came back "No template with that id." and the drift grew.
   * `cache: "no-store"` is belt and braces on the same failure: a list served
   * from the browser's cache is stale by construction.
   */
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/resumes", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't read the list (${res.status}).`);
      setFiles(data.files as ResumeFile[]);
      setListStale(null);
    } catch (err) {
      // The rows stay, but they are labelled — a table that reads as verified
      // when nobody verified it is the failure this whole change is about.
      setListStale(err instanceof Error ? err.message : "Couldn't read the list.");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /**
   * Every write goes through here, so none of them can forget the reload.
   *
   * A 404 is success, not failure: it means the thing is already gone, which is
   * what the click asked for. Reporting it as an error taught the screen to
   * argue with the database.
   */
  async function mutate(url: string, init: RequestInit, gone: string) {
    setError(null);
    setNote(null);
    try {
      const res = await fetch(url, { ...init, cache: "no-store" });
      if (res.status === 404) {
        setNote(gone);
        return true;
      }
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "That didn't work.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
      return false;
    } finally {
      await reload();
    }
  }

  async function post<T>(url: string, body: FormData, stage: string): Promise<T> {
    setBusy(stage);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(url, { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status}).`);
      return data as T;
    } finally {
      setBusy(null);
    }
  }

  async function recordJob() {
    if (!result?.renderId || !job.company.trim()) return;
    setError(null);
    try {
      const res = await fetch(`/api/renders/${result.renderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...job, submittedAt: new Date().toISOString() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Couldn't record that.");
      setSaved(`Logged against ${job.company.trim()} and added to the tracker.`);
      setJob({ company: "", role: "", jobUrl: "" });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record that.");
    }
  }

  /**
   * Staged, then committed — never triggered by the drop itself.
   *
   * Dropping a file used to upload it immediately, which made the gesture the
   * decision: there was no moment between "here is a file" and "this is now the
   * house style every render is built on". Joel asked for the confirm, and a
   * template is exactly the wrong thing to change by accident.
   */
  async function saveTemplate() {
    if (!template) return;
    const body = new FormData();
    body.append("file", template);
    try {
      await post<unknown>("/api/templates", body, "Reading template…");
      setTemplate(null);
      setNote("Saved as the new version, and it is now the active template.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that template.");
      await reload();
    }
  }

  async function reformat() {
    if (!source || !active) return;
    setResult(null);
    // Without this the previous render's confirmation sticks around and hides
    // the job form for the new one.
    setSaved(null);
    const body = new FormData();
    body.append("source", source);
    try {
      setResult(await post<Reformatted>("/api/reformat", body, "Reading both documents…"));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reformatting failed.");
    }
  }

  /**
   * Re-runs whenever either document changes, so the comparison appears the
   * moment the second one lands rather than waiting to be asked for.
   */
  async function runCheck(finished: File, against: File | null) {
    setInspection(null);
    const body = new FormData();
    body.append("file", finished);
    if (against) body.append("source", against);
    try {
      setInspection(await post<Inspection>("/api/inspect", body, "Reading document…"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  }

  function download() {
    if (!result) return;
    const bytes = Uint8Array.from(atob(result.docxBase64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(
      new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── what the list says ─────────────────────────────────────────────── */

  const templates = files?.filter((f) => f.kind === "template") ?? null;
  const active = templates?.find((t) => t.active) ?? null;
  const newest =
    templates
      ?.filter((t) => !t.archived)
      .reduce<ResumeFile | null>((best, t) => (best && (best.version ?? 0) >= (t.version ?? 0) ? best : t), null) ??
    null;
  const pinnedOlder = active && newest && active.id !== newest.id ? { active, newest } : null;
  const archivedCount = templates?.filter((t) => t.archived).length ?? 0;

  const visible = (files ?? [])
    .filter((f) => kindFilter === "all" || f.kind === kindFilter)
    .filter((f) => showArchived || !f.archived);

  const counts = {
    all: (files ?? []).filter((f) => showArchived || !f.archived).length,
    template: (files ?? []).filter((f) => f.kind === "template" && (showArchived || !f.archived)).length,
    input: (files ?? []).filter((f) => f.kind === "input").length,
    output: (files ?? []).filter((f) => f.kind === "output").length,
  };

  /* ── actions on a row ───────────────────────────────────────────────── */

  /**
   * The confirmation says what deletion actually does, and it changed on
   * 2026-09-17: it used to warn that the API would refuse if any render was
   * built from the template. It no longer refuses — the renders survive with a
   * null template and their own snapshot of what produced them — so saying so
   * would be describing a rule that is gone.
   */
  function removeFile(f: ResumeFile) {
    if (f.kind === "template") {
      const ok = window.confirm(
        `Delete ${f.name} (v${f.version})? The file goes too. Renders built from it stay, and keep their record of what made them.`
      );
      if (!ok) return;
      void mutate(`/api/templates/${f.id}`, { method: "DELETE" }, "That template was already gone.");
      return;
    }

    // Both rows of a render delete the render. Saying so is the point of the
    // confirm — the other row is on screen and would otherwise look orphaned.
    const ok = window.confirm(
      `Delete this render? Both files go — the resume you uploaded and the one that came out.${
        f.company ? ` The tracker thread for ${f.company} stays.` : ""
      }`
    );
    if (!ok) return;
    void mutate(`/api/renders/${f.id}`, { method: "DELETE" }, "That render was already gone.");
  }

  const patchTemplate = (id: string, body: Record<string, unknown>) =>
    mutate(
      `/api/templates/${id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      "That template was already gone."
    );

  /* ── render ─────────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-bar text-bar-ink border-b-4 border-accent">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <h1 className="font-semibold whitespace-nowrap">Resume Formatter</h1>
          <nav className="flex gap-0.5 order-last w-full sm:order-none sm:w-auto sm:ml-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id);
                  setError(null);
                  setNote(null);
                }}
                aria-current={tab === t.id ? "page" : undefined}
                className={`flex-1 sm:flex-none rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === t.id ? "bg-accent text-accent-ink" : "opacity-70 hover:opacity-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto">
            <ThemeControl livery={LIVERY} onBar />
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-5 flex flex-col gap-4">
        {error && <p className="text-sm text-urgent bg-surface border border-urgent rounded-lg px-4 py-2.5">{error}</p>}
        {note && <p className="text-sm bg-surface border border-line rounded-lg px-4 py-2.5">{note}</p>}
        {listStale && (
          <p className="text-sm text-warn bg-surface border border-warn rounded-lg px-4 py-2.5">
            {listStale} What is listed below is the last answer that arrived, not the current one.
          </p>
        )}

        {tab === "reformat" && (
          <Workbench
            rail={
              <>
                {active ? (
                  <div className="bg-surface border border-line rounded-xl px-4 py-3">
                    <p className="text-[0.7rem] uppercase tracking-wide opacity-60">House style</p>
                    <p className="text-sm font-medium break-all">
                      {active.name} <span className="opacity-60 font-normal">v{active.version}</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-sm bg-surface border border-warn text-warn rounded-xl px-4 py-3">
                    No template saved yet. Add one below — it saves and becomes the house style.
                  </p>
                )}

                {pinnedOlder && (
                  <p className="text-sm bg-surface border border-warn text-warn rounded-xl px-4 py-3">
                    Rendering with v{pinnedOlder.active.version}. Your most recent is v{pinnedOlder.newest.version}.
                  </p>
                )}

                <FilePick label="Tailored resume" hint="The Jobright export to reformat" file={source} onPick={setSource} />
                <FilePick
                  label={active ? "Replace the template" : "Template"}
                  hint={active ? "A new version, which becomes the house style" : "Your resume, whose formatting to copy"}
                  file={template}
                  onPick={setTemplate}
                />

                {/* The confirm step. Dropping a file stages it; this commits it. */}
                {template && (
                  <div className="bg-surface border border-accent rounded-xl px-4 py-3 flex flex-col gap-3">
                    <p className="text-sm">
                      Save <span className="font-medium break-all">{template.name}</span> as the template? It becomes the
                      new version, and every render from now on is built on it.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTemplate(null)}
                        disabled={busy !== null}
                        className="border border-line rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveTemplate}
                        disabled={busy !== null}
                        className="bg-accent text-accent-ink rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                      >
                        Save and activate
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={reformat}
                  disabled={!source || !active || busy !== null}
                  className="w-full bg-accent text-accent-ink rounded-xl px-5 py-3 font-medium disabled:opacity-50"
                >
                  {busy ?? "Reformat"}
                </button>
                <p className="text-xs opacity-60">
                  Every render is saved — the source, the output and which template built it — so what you sent stays
                  reproducible. Both files are on the Resume tab.
                </p>
              </>
            }
          >
            {!result ? (
              <Panel title="What comes back">
                <p className="text-sm opacity-70">
                  Your template with this resume&apos;s text in it, plus how much of the source reached the document, an
                  ATS check on the output, and what the renderer changed. Nothing is generated: every line is moved
                  across word for word.
                </p>
              </Panel>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat
                    value={`${result.coverage.percent}%`}
                    label="Lines carried"
                    tone={result.coverage.percent === 100 ? "good" : "warn"}
                  />
                  <Stat
                    value={`${result.findings.length}`}
                    label="ATS findings"
                    tone={result.findings.length === 0 ? "good" : "warn"}
                  />
                  <Stat value={`${result.summary.experience.length}`} label="Roles" />
                  <Stat value={`${result.summary.highlights}`} label="Highlights" />
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    onClick={download}
                    className="flex-1 bg-accent text-accent-ink rounded-xl px-5 py-3 font-medium"
                  >
                    Download {result.filename}
                  </button>
                  <p className="text-xs opacity-60 sm:max-w-[16rem]">
                    Rendered with {result.templateLabel}. {result.renderId ? "Saved to the Resume tab." : "Not saved."}
                  </p>
                </div>

                {result.coverage.missing.length > 0 && (
                  <Panel title="Not carried across" aside={<span className="text-xs text-warn">check before sending</span>}>
                    <ul className="list-disc pl-5 text-sm flex flex-col gap-1">
                      {result.coverage.missing.map((d, i) => (
                        <li key={i} className="break-words">
                          {d}
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}

                <Panel title="ATS check on the output">
                  <div className="flex flex-col gap-2">
                    <Findings findings={result.findings} />
                    <p className="text-xs opacity-60">
                      The output is your template with the text swapped, so a finding here is almost always about the
                      template. Fix it there and every future render inherits the fix.
                    </p>
                  </div>
                </Panel>

                <details className="bg-surface border border-line rounded-xl overflow-hidden">
                  <summary className="px-4 py-2.5 text-sm font-semibold cursor-pointer">
                    What went in · {result.summary.hasSummary ? "summary" : "no summary"}, {result.summary.competencies}{" "}
                    competenc{result.summary.competencies === 1 ? "y" : "ies"}
                  </summary>
                  <ul className="border-t border-line divide-y divide-line">
                    {result.summary.experience.map((e, i) => (
                      <li key={`${e.company}-${i}`} className="px-4 py-2 flex items-baseline justify-between gap-3">
                        <span className="min-w-0">
                          <span className="font-medium">{e.company}</span>
                          {e.title && <span className="opacity-70"> — {e.title}</span>}
                        </span>
                        <span className="text-xs opacity-60 whitespace-nowrap">
                          {e.date || "no date"} · {e.bullets} bullet{e.bullets === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>

                <details className="bg-surface border border-line rounded-xl overflow-hidden">
                  <summary className="px-4 py-2.5 text-sm font-semibold cursor-pointer">
                    What it did to the template · {result.changeLog.length} change
                    {result.changeLog.length === 1 ? "" : "s"}
                  </summary>
                  <ul className="border-t border-line divide-y divide-line">
                    {result.changeLog.map((c, i) => (
                      <li key={i} className="px-4 py-2 flex items-baseline justify-between gap-3">
                        <span className="text-sm min-w-0">
                          <span className="font-medium">{c.section}</span> <span className="opacity-70">{c.detail}</span>
                        </span>
                        <span className="text-xs opacity-60 whitespace-nowrap">{c.action}</span>
                      </li>
                    ))}
                  </ul>
                </details>

                {result.renderId && (
                  <Panel title="Where did this go?">
                    {saved ? (
                      <p className="text-sm">{saved}</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <p className="text-xs opacity-60">
                          Naming a company creates the thread in Pipeline Tracker. Leave it blank if you have not sent
                          this yet — it stays on the Resume tab either way.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-3">
                          {(
                            [
                              ["company", "Company", "Northwind"],
                              ["role", "Role", "Product Analyst II"],
                              ["jobUrl", "Posting URL", "https://…"],
                            ] as const
                          ).map(([key, label, placeholder]) => (
                            <label key={key} className="flex flex-col gap-1">
                              <span className="text-[0.7rem] uppercase tracking-wide opacity-60">{label}</span>
                              <input
                                value={job[key]}
                                onChange={(e) => setJob({ ...job, [key]: e.target.value })}
                                placeholder={placeholder}
                                className="border border-line rounded-lg px-3 py-2 text-sm bg-paper"
                              />
                            </label>
                          ))}
                        </div>
                        <button
                          onClick={recordJob}
                          disabled={!job.company.trim()}
                          className="bg-accent text-accent-ink rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 w-fit"
                        >
                          Log as submitted
                        </button>
                      </div>
                    )}
                  </Panel>
                )}
              </>
            )}
          </Workbench>
        )}

        {tab === "resume" && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ["all", "All"],
                  ["template", "Templates"],
                  ["input", "Inputs"],
                  ["output", "Outputs"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setKindFilter(id)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    kindFilter === id ? "bg-accent text-accent-ink border-accent" : "border-line bg-surface opacity-80"
                  }`}
                >
                  {label} <span className="opacity-60">{counts[id]}</span>
                </button>
              ))}
              {archivedCount > 0 && (
                <label className="ml-auto flex items-center gap-2 text-sm opacity-80">
                  <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                  Show archived ({archivedCount})
                </label>
              )}
            </div>

            <p className="text-xs opacity-60">
              Every file this app is holding. A template is the house style; an input is what you uploaded and an output
              is what came out, and those two belong to one render — deleting either deletes both. Archiving is the
              gentle way to retire a template; deleting takes the file, and the renders built from it stay.
            </p>

            {files === null ? (
              <p className="text-sm opacity-60">Loading…</p>
            ) : visible.length === 0 ? (
              <Panel>
                <p className="text-sm">
                  {files.length === 0
                    ? "Nothing here yet. Save a template on the Reformat tab, then run a resume through it."
                    : "Nothing of that type."}
                </p>
              </Panel>
            ) : (
              <ul className="bg-surface border border-line rounded-xl divide-y divide-line overflow-hidden">
                {visible.map((f) => (
                  <li
                    key={f.key}
                    className={`px-4 py-3 flex flex-col gap-1.5 ${
                      f.id === highlightRender ? "bg-accent/5 border-l-2 border-l-accent" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`text-[0.65rem] uppercase tracking-wide border rounded px-1.5 py-0.5 shrink-0 ${
                          KIND_STYLE[f.kind]
                        }`}
                      >
                        {KIND_LABEL[f.kind]}
                      </span>
                      <span className="font-medium truncate min-w-0 flex-1" title={f.name}>
                        {f.name}
                      </span>
                      {f.version !== null && <span className="text-sm opacity-60 shrink-0">v{f.version}</span>}
                      {f.active && (
                        <span className="text-[0.65rem] bg-accent text-accent-ink rounded-full px-2 py-0.5 shrink-0">
                          Active
                        </span>
                      )}
                      {f.archived && <span className="text-[0.65rem] opacity-60 shrink-0">Archived</span>}
                      <span className="text-xs opacity-60 whitespace-nowrap shrink-0">{shortDate(f.createdAt)}</span>
                    </div>

                    {/* Detail left, actions right on a wide screen; two stacked
                        lines in the hub's frame, where wrapping them into one
                        row put Download and Delete on different lines. */}
                    <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span className="opacity-60 min-w-0">
                        {f.kind === "template"
                          ? f.spec
                            ? `${f.spec.font} ${f.spec.bodySize}pt · headings ${f.spec.headingSize}pt · margins ${f.spec.margins.left}" as uploaded`
                            : "No spec recorded"
                          : [
                              f.company ?? "No job recorded",
                              f.stage,
                              f.submittedAt ? `submitted ${shortDate(f.submittedAt)}` : "not sent",
                              f.coverage === null ? null : `${f.coverage}% coverage`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        {/* A plain link, not fetch: the browser saves the file itself
                            and the response never has to pass through React. */}
                        <a href={f.downloadHref} className="underline opacity-80">
                          Download
                        </a>
                        {f.kind === "template" && !f.active && !f.archived && (
                          <button
                            onClick={() => void patchTemplate(f.id, { is_active: true })}
                            className="underline opacity-80"
                          >
                            Make active
                          </button>
                        )}
                        {f.kind === "template" && (
                          <button
                            onClick={() => void patchTemplate(f.id, { archived: !f.archived })}
                            className="underline opacity-80"
                          >
                            {f.archived ? "Restore" : "Archive"}
                          </button>
                        )}
                        <button onClick={() => removeFile(f)} className="underline text-urgent">
                          Delete
                        </button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === "check" && (
          <Workbench
            rail={
              <>
                <FilePick
                  label="Finished resume"
                  hint="The .docx you're about to send"
                  file={single}
                  onPick={(f) => {
                    setSingle(f);
                    void runCheck(f, checkSource);
                  }}
                />
                <FilePick
                  label="Jobright export (optional)"
                  hint="Checks nothing was dropped"
                  file={checkSource}
                  onPick={(f) => {
                    setCheckSource(f);
                    if (single) void runCheck(single, f);
                  }}
                />
                {busy && <p className="text-xs opacity-60">{busy}</p>}
              </>
            }
          >
            {!inspection ? (
              <Panel title="What this reads">
                <p className="text-sm opacity-70">
                  Drop the finished document in and you get what a parser actually sees: the name it detects, the
                  sections it finds, and anything structural that would trip it up. Add the Jobright export and every
                  line of it is checked against the document — its exact wording is the keyword optimisation, so a line
                  lost while copying is lost coverage, and nothing about the finished file shows it used to be there.
                </p>
              </Panel>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat
                    value={inspection.content ? `${inspection.content.percent}%` : "—"}
                    label="Lines carried"
                    tone={!inspection.content ? "plain" : inspection.content.percent === 100 ? "good" : "warn"}
                  />
                  <Stat
                    value={`${inspection.findings.length}`}
                    label="ATS findings"
                    tone={inspection.findings.length === 0 ? "good" : "warn"}
                  />
                  <Stat value={`${inspection.outline.sections.length}`} label="Sections" />
                  <Stat value={`${inspection.paragraphCount}`} label="Paragraphs" />
                </div>

                <Panel
                  title="ATS check"
                  aside={
                    <span className="text-xs opacity-60 truncate max-w-[14rem]" title={inspection.filename}>
                      {inspection.filename}
                    </span>
                  }
                >
                  <Findings findings={inspection.findings} />
                </Panel>

                <Panel title="Nothing dropped">
                  {inspection.content === null ? (
                    <p className="text-sm opacity-70">
                      Attach the Jobright export on the left and every line of it gets checked against this document.
                    </p>
                  ) : inspection.content.missing.length === 0 ? (
                    <p className="text-sm">
                      Every line of {inspection.sourceFilename} appears in the finished document.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-urgent font-medium">
                        {inspection.content.missing.length} line
                        {inspection.content.missing.length === 1 ? "" : "s"} of {inspection.sourceFilename} reached the
                        finished document nowhere:
                      </p>
                      <ul className="flex flex-col divide-y divide-line">
                        {inspection.content.missing.map((line) => (
                          <li key={line} className="py-1.5 text-sm">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Panel>

                <Panel
                  title="What the parser read"
                  aside={
                    <span className="text-xs opacity-60">
                      name: <span className="font-medium">{inspection.outline.title ?? "none"}</span>
                    </span>
                  }
                >
                  <ul className="flex flex-col divide-y divide-line">
                    {inspection.outline.sections.map((s) => (
                      <li key={s.heading} className="py-1.5 flex items-baseline justify-between gap-3">
                        <span className="font-medium text-sm">{s.heading}</span>
                        <span className="text-xs opacity-60 whitespace-nowrap">
                          {s.entries > 0 && `${s.entries} job${s.entries === 1 ? "" : "s"} · `}
                          {s.lines} line{s.lines === 1 ? "" : "s"}
                          {s.bullets > 0 && ` · ${s.bullets} bullet${s.bullets === 1 ? "" : "s"}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </>
            )}
          </Workbench>
        )}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <ReformatShell />
    </Suspense>
  );
}
