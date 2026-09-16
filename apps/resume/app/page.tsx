"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LIVERY } from "@/lib/livery";
import ThemeControl from "./ThemeControl";

type Tab = "reformat" | "templates" | "history" | "check";
// Check leads, and is the landing tab: formatting happens in Word now, and the
// last thing before sending is the one this app is for.
const TABS: Tab[] = ["check", "reformat", "templates", "history"];

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

type Template = {
  id: string;
  version: number;
  name: string;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  spec: { font: string; bodySize: number; headingSize: number; margins: { left: number; top: number } };
};

type RenderRow = {
  id: string;
  created_at: string;
  submitted_at: string | null;
  thread_id: string | null;
  coverage: Coverage;
  thread: { company: string; stage: string } | null;
};

type ContentCheck = { totalLines: number; present: number; missing: string[]; percent: number };

type Inspection = {
  filename: string;
  sizeBytes: number;
  paragraphCount: number;
  namedStyles: number;
  outline: { title: string | null; sections: { heading: string; lines: number; bullets: number }[]; preamble: string[] };
  findings: Finding[];
  /** Null until the document the text came from is attached too. */
  sourceFilename: string | null;
  content: ContentCheck | null;
};

const DOCX = ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * The upload control, used for every file this app takes in.
 *
 * A drop target rather than a button: same pattern as Coffee's bag scanner, so
 * the two tools do not ask for a file in two different ways. The <label> wraps a
 * visually hidden input, which keeps the keyboard and screen-reader behaviour of
 * a real file input — a div with a click handler has neither.
 *
 * Fixed height, because these sit side by side and a long filename in one must
 * not make it taller than its neighbour.
 */
function FilePick({ label, hint, file, onPick }: { label: string; hint: string; file: File | null; onPick: (f: File) => void }) {
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
      className={`h-full min-h-[10.5rem] border-2 border-dashed rounded-2xl bg-surface px-4 py-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
        over ? "border-accent bg-accent/5" : "border-line"
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
      <span className="text-3xl block mb-2" aria-hidden>
        📄
      </span>
      <span className="text-xs uppercase tracking-wide opacity-60">{label}</span>
      <span className={`text-sm mt-1 break-all line-clamp-2 ${file ? "font-medium" : "opacity-60"}`}>
        {file ? file.name : hint}
      </span>
      <span className="text-xs opacity-50 mt-1">{file ? "Choose another, or drop one in" : "Drop it here, or choose a file"}</span>
    </label>
  );
}

function Findings({ findings }: { findings: Finding[] }) {
  const blocking = findings.filter((f) => f.severity === "blocking");
  const warnings = findings.filter((f) => f.severity === "warning");
  if (findings.length === 0) {
    return (
      <p className="text-sm bg-surface border border-line rounded-xl px-4 py-3">
        No structural problems. Single column, contact details in the body, no stray tables.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {[...blocking, ...warnings].map((f) => (
        <div
          key={f.code}
          className={`rounded-xl px-4 py-3 border text-sm ${
            f.severity === "blocking" ? "bg-surface border-urgent text-urgent" : "bg-surface border-warn text-warn"
          }`}
        >
          <p className="font-medium mb-1">
            {f.severity === "blocking" ? "Blocking" : "Warning"} · {f.code.replace(/_/g, " ")}
          </p>
          <p>{f.message}</p>
        </div>
      ))}
    </div>
  );
}

function ReformatShell() {
  // Deep links from the dashboard point at a specific tab, usually history —
  // "the resume you never sent" is only actionable if it opens where it lives.
  const params = useSearchParams();
  const requestedTab = params.get("tab");
  const highlightRender = params.get("render");

  const [tab, setTab] = useState<Tab>(
    TABS.includes(requestedTab as Tab) ? (requestedTab as Tab) : "check"
  );
  const [renders, setRenders] = useState<RenderRow[] | null>(null);
  const [job, setJob] = useState({ company: "", role: "", jobUrl: "" });
  const [saved, setSaved] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [archived, setArchived] = useState<Template[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [template, setTemplate] = useState<File | null>(null);
  const [source, setSource] = useState<File | null>(null);
  const [single, setSingle] = useState<File | null>(null);
  const [checkSource, setCheckSource] = useState<File | null>(null);
  const [result, setResult] = useState<Reformatted | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    refreshTemplates();
    refreshRenders();
  }, []);

  async function refreshRenders() {
    try {
      const res = await fetch("/api/renders");
      const data = await res.json();
      if (res.ok) setRenders(data.renders as RenderRow[]);
    } catch {
      // The tab shows its own empty state.
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
      await refreshRenders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record that.");
    }
  }

  async function refreshTemplates() {
    try {
      const [live, gone] = await Promise.all([fetch("/api/templates"), fetch("/api/templates?archived=1")]);
      const liveData = await live.json();
      if (live.ok) setTemplates(liveData.templates as Template[]);
      const goneData = await gone.json();
      if (gone.ok) setArchived(goneData.templates as Template[]);
    } catch {
      // The tab shows its own empty state; a failed refresh is not worth a banner.
    }
  }

  async function setArchivedState(id: string, archive: boolean) {
    setError(null);
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: archive }),
      });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't change that template.");
      }
      await refreshTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change that template.");
    }
  }

  /** Deletion is refused by the API for any template a render points at, so the
   *  confirmation says what it actually does rather than promising more. */
  async function remove(t: Template) {
    setError(null);
    const ok = window.confirm(
      `Delete ${t.name} (v${t.version})? The file goes too. This is refused if any render was built from it — archive those instead.`
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/templates/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't delete that template.");
      await refreshTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete that template.");
    }
  }

  async function uploadTemplate(file: File) {
    const body = new FormData();
    body.append("file", file);
    try {
      await post<unknown>("/api/templates", body, "Reading template…");
      await refreshTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that template.");
    }
  }

  async function activate(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: true }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't switch template.");
      await refreshTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't switch template.");
    }
  }

  async function post<T>(url: string, body: FormData, stage: string): Promise<T> {
    setBusy(stage);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status}).`);
      return data as T;
    } finally {
      setBusy(null);
    }
  }

  async function reformat() {
    if (!source || (!template && !active)) return;
    setResult(null);
    // Without this the previous render's confirmation sticks around and hides
    // the job form for the new one.
    setSaved(null);
    const body = new FormData();
    // A one-off template overrides the stored one and saves nothing.
    if (template) body.append("template", template);
    body.append("source", source);
    try {
      setResult(await post<Reformatted>("/api/reformat", body, "Reading both documents…"));
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

  function checkFinished(file: File) {
    setSingle(file);
    void runCheck(file, checkSource);
  }

  function checkAgainst(file: File) {
    setCheckSource(file);
    if (single) void runCheck(single, file);
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

  const active = templates?.find((t) => t.is_active) ?? null;
  const newest = templates && templates.length > 0 ? templates[0] : null;
  const pinnedOlder = active && newest && active.id !== newest.id ? { active, newest } : null;

  return (
    <main className="min-h-screen px-5 py-8 max-w-3xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Resume Formatter</h1>
        <p className="text-sm text-ink-soft">
          The last look before you send it: what a parser will actually read, and whether you lost a word on the way.
        </p>
        <ThemeControl livery={LIVERY} />
      </header>

      <nav className="flex gap-1 bg-surface border border-line rounded-xl p-1">
        {(["reformat", "templates", "history", "check"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setError(null);
            }}
            className={`flex-1 rounded-lg px-2 py-2 text-xs sm:text-sm font-medium ${
              tab === t ? "bg-accent text-accent-ink" : "opacity-70"
            }`}
          >
            {t === "reformat" ? "Reformat" : t === "templates" ? "Templates" : t === "history" ? "History" : "Check"}
          </button>
        ))}
      </nav>

      {error && <p className="text-sm text-urgent bg-surface border border-urgent rounded-lg px-4 py-3">{error}</p>}

      {tab === "reformat" ? (
        <>
          <section className="flex flex-col gap-3">
            {active ? (
              <div className="bg-surface border border-line rounded-xl px-4 py-3">
                <p className="text-xs uppercase tracking-wide opacity-60">Template</p>
                <p className="text-sm font-medium">
                  {active.name} <span className="opacity-60 font-normal">v{active.version}</span>
                </p>
              </div>
            ) : (
              <p className="text-sm bg-surface border border-warn text-warn rounded-xl px-4 py-3">
                No template saved yet. Add one on the Templates tab, or attach a one-off below.
              </p>
            )}
            {pinnedOlder && (
              <p className="text-sm bg-surface border border-warn text-warn rounded-xl px-4 py-3">
                Rendering with v{pinnedOlder.active.version} ({pinnedOlder.active.name}). Your most recent is v
                {pinnedOlder.newest.version}.
              </p>
            )}
            {/* Side by side from sm up, stacked on a phone. `items-stretch` with
                the control's own h-full is what keeps the two the same height
                when one holds a long filename and the other holds a hint. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
              <FilePick label="Tailored resume" hint="The Jobright export to reformat" file={source} onPick={setSource} />
              <FilePick
                label={active ? "One-off template (optional)" : "Template"}
                hint={active ? "Overrides the saved template, saves nothing" : "Your resume, whose formatting to copy"}
                file={template}
                onPick={setTemplate}
              />
            </div>
            <button
              onClick={reformat}
              disabled={!source || (!template && !active) || busy !== null}
              className="w-full bg-accent text-accent-ink rounded-xl px-5 py-4 text-base font-medium disabled:opacity-50"
            >
              {busy ?? "Reformat"}
            </button>
            <p className="text-xs opacity-60">
              Saved renders keep the source, the output, and the template as it was — so what you sent stays
              reproducible. A one-off template renders a preview and saves nothing.
            </p>
          </section>

          {result && (
            <>
              <section
                className={`rounded-xl px-4 py-3 border text-sm ${
                  result.coverage.percent === 100
                    ? "bg-surface border-line"
                    : "bg-surface border-warn text-warn"
                }`}
              >
                <p className="font-medium">
                  {result.coverage.present} of {result.coverage.totalLines} lines carried across (
                  {result.coverage.percent}%)
                </p>
                {result.coverage.missing.length > 0 ? (
                  <div className="mt-2 flex flex-col gap-1">
                    <p>Not carried across — check these before you send it:</p>
                    <ul className="list-disc pl-5">
                      {result.coverage.missing.map((d, i) => (
                        <li key={i} className="break-words">{d}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="opacity-70 mt-1">
                    Every line taken from the source reached the document, wording untouched. Your name, contact
                    block and the static sections come from the template on purpose, so they are not counted here.
                  </p>
                )}
              </section>

              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">ATS check on the output</h2>
                <p className="text-xs opacity-60">
                  The output is your template with the text swapped, so a finding here is almost always about the
                  template. Fix it there and every future render inherits the fix.
                </p>
                <Findings findings={result.findings} />
              </section>

              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">What went in</h2>
                <div className="bg-surface border border-line rounded-xl p-4 flex flex-col gap-2">
                  <p className="text-sm opacity-70">
                    {result.summary.hasSummary ? "Summary" : "No summary"} · {result.summary.highlights} highlight
                    {result.summary.highlights === 1 ? "" : "s"} · {result.summary.competencies} competency row
                    {result.summary.competencies === 1 ? "" : "s"}
                  </p>
                  <ul className="flex flex-col divide-y divide-line">
                    {result.summary.experience.map((e, i) => (
                      <li key={`${e.company}-${i}`} className="py-2 flex items-baseline justify-between gap-3">
                        <span>
                          <span className="font-medium">{e.company}</span>
                          {e.title && <span className="opacity-70"> — {e.title}</span>}
                        </span>
                        <span className="text-sm opacity-60 whitespace-nowrap">
                          {e.date || "no date"} · {e.bullets} bullet{e.bullets === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">What it did to the template</h2>
                <ul className="bg-surface border border-line rounded-xl p-4 flex flex-col divide-y divide-line">
                  {result.changeLog.map((c, i) => (
                    <li key={i} className="py-2 flex items-baseline justify-between gap-3">
                      <span className="text-sm">
                        <span className="font-medium">{c.section}</span> <span className="opacity-70">{c.detail}</span>
                      </span>
                      <span className="text-xs opacity-60 whitespace-nowrap">{c.action}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <div className="flex flex-col gap-2">
                <button onClick={download} className="w-full bg-accent text-accent-ink rounded-xl px-5 py-4 text-base font-medium">
                  Download {result.filename}
                </button>
                <p className="text-xs opacity-60">
                  Rendered with {result.templateLabel}.{" "}
                  {result.renderId ? "Saved to your render history." : "Preview only — nothing was saved."}
                </p>
              </div>

              {result.renderId && (
                <section className="flex flex-col gap-3">
                  <h2 className="text-lg font-semibold">Where did this go?</h2>
                  {saved ? (
                    <p className="text-sm bg-surface border border-line rounded-xl px-4 py-3">{saved}</p>
                  ) : (
                    <div className="bg-surface border border-line rounded-xl p-4 flex flex-col gap-3">
                      <p className="text-xs opacity-60">
                        Naming a company creates the thread in Pipeline Tracker. Leave it blank if you have not sent
                        this yet — it stays in history either way.
                      </p>
                      {([
                        ["company", "Company", "Northwind"],
                        ["role", "Role", "Product Analyst II"],
                        ["jobUrl", "Posting URL", "https://…"],
                      ] as const).map(([key, label, placeholder]) => (
                        <label key={key} className="flex flex-col gap-1">
                          <span className="text-xs uppercase tracking-wide opacity-60">{label}</span>
                          <input
                            value={job[key]}
                            onChange={(e) => setJob({ ...job, [key]: e.target.value })}
                            placeholder={placeholder}
                            className="border border-line rounded-lg px-3 py-2 text-sm"
                          />
                        </label>
                      ))}
                      <button
                        onClick={recordJob}
                        disabled={!job.company.trim()}
                        className="w-full bg-accent text-accent-ink rounded-xl px-5 py-3 text-sm font-medium disabled:opacity-50"
                      >
                        Log as submitted
                      </button>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </>
      ) : tab === "templates" ? (
        <>
          <section className="flex flex-col gap-3">
            <FilePick
              label="Add a template"
              hint="A .docx whose formatting becomes the house style"
              file={null}
              onPick={uploadTemplate}
            />
            <p className="text-xs opacity-60">
              Every upload is a new version and becomes active. Archiving hides one without touching the
              renders built from it; deleting is only possible when there are none.
            </p>
          </section>

          {pinnedOlder && (
            <p className="text-sm bg-surface border border-warn text-warn rounded-xl px-4 py-3">
              v{pinnedOlder.active.version} is pinned active, but v{pinnedOlder.newest.version} is newer.
            </p>
          )}

          <section className="flex flex-col gap-2">
            {templates === null && <p className="text-sm opacity-60">Loading…</p>}
            {templates?.length === 0 && (
              <p className="text-sm bg-surface border border-line rounded-xl px-4 py-3">
                No templates yet. Add the resume whose look you want everything to match.
              </p>
            )}
            {templates?.map((t) => (
              <div key={t.id} className="bg-surface border border-line rounded-xl px-4 py-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium break-all">
                      {t.name} <span className="opacity-60 font-normal">v{t.version}</span>
                    </p>
                    <p className="text-xs opacity-60 mt-0.5">
                      {t.spec.font} {t.spec.bodySize}pt · headings {t.spec.headingSize}pt · margins{" "}
                      {t.spec.margins.left}&quot; as uploaded · {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {t.is_active ? (
                    <span className="text-xs bg-accent text-accent-ink rounded-full px-2.5 py-1 whitespace-nowrap">Active</span>
                  ) : (
                    <button
                      onClick={() => activate(t.id)}
                      className="text-xs underline whitespace-nowrap opacity-80"
                    >
                      Make active
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  {/* A plain link, not fetch: the browser saves the file itself
                      and the response never has to pass through React. */}
                  <a href={`/api/templates/${t.id}/file`} className="underline opacity-80">
                    Download
                  </a>
                  <button onClick={() => setArchivedState(t.id, true)} className="underline opacity-80">
                    Archive
                  </button>
                  <button onClick={() => remove(t)} className="underline text-urgent">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </section>

          {archived && archived.length > 0 && (
            <section className="flex flex-col gap-2">
              <button
                onClick={() => setShowArchived((v) => !v)}
                className="text-sm underline opacity-70 w-fit"
              >
                {showArchived ? "Hide" : "Show"} archived ({archived.length})
              </button>
              {showArchived &&
                archived.map((t) => (
                  <div key={t.id} className="bg-surface border border-line rounded-xl px-4 py-3 flex flex-col gap-2 opacity-70">
                    <p className="font-medium break-all">
                      {t.name} <span className="opacity-60 font-normal">v{t.version}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <a href={`/api/templates/${t.id}/file`} className="underline opacity-80">
                        Download
                      </a>
                      <button onClick={() => setArchivedState(t.id, false)} className="underline opacity-80">
                        Restore
                      </button>
                      <button onClick={() => remove(t)} className="underline text-urgent">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
            </section>
          )}
        </>
      ) : tab === "history" ? (
        <section className="flex flex-col gap-2">
          {renders === null && <p className="text-sm opacity-60">Loading…</p>}
          {renders?.length === 0 && (
            <p className="text-sm bg-surface border border-line rounded-xl px-4 py-3">
              No renders yet. Reformat a resume and it lands here.
            </p>
          )}
          {renders?.map((r) => (
            <div
              key={r.id}
              className={`bg-surface border rounded-xl px-4 py-3 flex flex-col gap-1 ${
                r.id === highlightRender ? "border-accent ring-2 ring-accent/30" : "border-line"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{r.thread?.company ?? "No job recorded"}</p>
                <span className="text-xs opacity-60 whitespace-nowrap">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-xs opacity-60">
                {r.submitted_at ? `Submitted ${new Date(r.submitted_at).toLocaleDateString()}` : "Rendered, not sent"}
                {r.thread?.stage ? ` · ${r.thread.stage}` : ""} · {r.coverage.percent}% coverage
              </p>
              <a href={`/api/renders/${r.id}/file`} className="text-sm underline w-fit mt-1">
                Download what was sent
              </a>
            </div>
          ))}
        </section>
      ) : (
        <>
          <section className="grid sm:grid-cols-2 gap-3">
            <FilePick
              label="Finished resume"
              hint="The .docx you're about to send"
              file={single}
              onPick={checkFinished}
            />
            <FilePick
              label="Jobright export (optional)"
              hint="Checks nothing was dropped"
              file={checkSource}
              onPick={checkAgainst}
            />
          </section>

          {inspection && (
            <>
              <section className="bg-surface border border-line rounded-xl p-4 flex flex-col gap-1">
                <p className="font-medium break-all">{inspection.filename}</p>
                <p className="text-sm opacity-70">
                  {(inspection.sizeBytes / 1024 / 1024).toFixed(2)} MB · {inspection.paragraphCount} paragraphs ·{" "}
                  {inspection.namedStyles === 0 ? "no named styles" : `${inspection.namedStyles} named styles`}
                </p>
              </section>

              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">ATS check</h2>
                <Findings findings={inspection.findings} />
              </section>

              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">Nothing dropped</h2>
                {inspection.content === null ? (
                  <p className="text-sm bg-surface border border-line rounded-xl px-4 py-3 opacity-70">
                    Attach the Jobright export above and every line of it gets checked against this document. Its
                    exact wording is the keyword optimisation, so a line lost while copying is lost coverage —
                    and nothing about the finished file shows it used to be there.
                  </p>
                ) : (
                  <div className="bg-surface border border-line rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-medium">
                        {inspection.content.present} of {inspection.content.totalLines} lines carried across
                      </p>
                      <span
                        className={`text-sm whitespace-nowrap ${
                          inspection.content.missing.length > 0 ? "text-urgent font-medium" : "opacity-60"
                        }`}
                      >
                        {inspection.content.percent}%
                      </span>
                    </div>
                    <p className="text-xs opacity-60 break-all">against {inspection.sourceFilename}</p>
                    {inspection.content.missing.length === 0 ? (
                      <p className="text-sm">Every line of the export appears in the finished document.</p>
                    ) : (
                      <>
                        <p className="text-sm text-urgent font-medium">
                          {inspection.content.missing.length} line
                          {inspection.content.missing.length === 1 ? "" : "s"} reached the finished document nowhere:
                        </p>
                        <ul className="flex flex-col divide-y divide-line">
                          {inspection.content.missing.map((line) => (
                            <li key={line} className="py-2 text-sm">
                              {line}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </section>

              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">What the parser read</h2>
                <div className="bg-surface border border-line rounded-xl p-4 flex flex-col gap-2">
                  <p className="text-sm">
                    <span className="opacity-60">Name detected:</span>{" "}
                    <span className="font-medium">{inspection.outline.title ?? "none"}</span>
                  </p>
                  <ul className="flex flex-col divide-y divide-line">
                    {inspection.outline.sections.map((s) => (
                      <li key={s.heading} className="py-2 flex items-baseline justify-between gap-3">
                        <span className="font-medium">{s.heading}</span>
                        <span className="text-sm opacity-60 whitespace-nowrap">
                          {s.lines} line{s.lines === 1 ? "" : "s"}
                          {s.bullets > 0 && ` · ${s.bullets} bullet${s.bullets === 1 ? "" : "s"}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <ReformatShell />
    </Suspense>
  );
}
