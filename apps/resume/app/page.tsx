"use client";

import { useEffect, useRef, useState } from "react";

type Finding = { code: string; severity: "blocking" | "warning"; message: string };
type Coverage = { totalParagraphs: number; placed: number; dropped: string[]; percent: number };
type SectionSummary = { label: string; kind: string; count: number };

type Reformatted = {
  filename: string;
  renderId: string | null;
  templateLabel: string;
  coverage: Coverage;
  findings: Finding[];
  summary: { name: string | null; contact: string | null; sections: SectionSummary[] };
  docxBase64: string;
};

type Template = {
  id: string;
  version: number;
  name: string;
  is_active: boolean;
  created_at: string;
  spec: { font: string; bodySize: number; headingSize: number; margins: { left: number; top: number } };
};

type Inspection = {
  filename: string;
  sizeBytes: number;
  paragraphCount: number;
  namedStyles: number;
  outline: { title: string | null; sections: { heading: string; lines: number; bullets: number }[]; preamble: string[] };
  findings: Finding[];
};

const DOCX = ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function FilePick({ label, hint, file, onPick }: { label: string; hint: string; file: File | null; onPick: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1">
      <input
        ref={ref}
        type="file"
        accept={DOCX}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => ref.current?.click()}
        className="w-full text-left bg-white border border-line rounded-xl px-4 py-3 flex flex-col gap-0.5"
      >
        <span className="text-xs uppercase tracking-wide opacity-60">{label}</span>
        <span className={`text-sm break-all ${file ? "font-medium" : "opacity-50"}`}>{file ? file.name : hint}</span>
      </button>
    </div>
  );
}

function Findings({ findings }: { findings: Finding[] }) {
  const blocking = findings.filter((f) => f.severity === "blocking");
  const warnings = findings.filter((f) => f.severity === "warning");
  if (findings.length === 0) {
    return (
      <p className="text-sm bg-white border border-line rounded-xl px-4 py-3">
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
            f.severity === "blocking" ? "bg-red-50 border-red-200 text-red-900" : "bg-amber-50 border-amber-200 text-amber-900"
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

export default function Home() {
  const [tab, setTab] = useState<"reformat" | "templates" | "check">("reformat");
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [template, setTemplate] = useState<File | null>(null);
  const [source, setSource] = useState<File | null>(null);
  const [single, setSingle] = useState<File | null>(null);
  const [result, setResult] = useState<Reformatted | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    refreshTemplates();
  }, []);

  async function refreshTemplates() {
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      if (res.ok) setTemplates(data.templates as Template[]);
    } catch {
      // The tab shows its own empty state; a failed refresh is not worth a banner.
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

  async function check(file: File) {
    setSingle(file);
    setInspection(null);
    const body = new FormData();
    body.append("file", file);
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

  const active = templates?.find((t) => t.is_active) ?? null;
  const newest = templates && templates.length > 0 ? templates[0] : null;
  const pinnedOlder = active && newest && active.id !== newest.id ? { active, newest } : null;

  return (
    <main className="min-h-screen px-5 py-8 max-w-3xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Resume Formatter</h1>
        <p className="text-sm opacity-70">
          Put a tailored resume into your own template, without losing a word of it.
        </p>
      </header>

      <nav className="flex gap-1 bg-white border border-line rounded-xl p-1">
        {(["reformat", "templates", "check"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setError(null);
            }}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
              tab === t ? "bg-accent text-white" : "opacity-70"
            }`}
          >
            {t === "reformat" ? "Reformat" : t === "templates" ? "Templates" : "ATS check"}
          </button>
        ))}
      </nav>

      {error && <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      {tab === "reformat" ? (
        <>
          <section className="flex flex-col gap-3">
            {active ? (
              <div className="bg-white border border-line rounded-xl px-4 py-3">
                <p className="text-xs uppercase tracking-wide opacity-60">Template</p>
                <p className="text-sm font-medium">
                  {active.name} <span className="opacity-60 font-normal">v{active.version}</span>
                </p>
              </div>
            ) : (
              <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3">
                No template saved yet. Add one on the Templates tab, or attach a one-off below.
              </p>
            )}
            {pinnedOlder && (
              <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3">
                Rendering with v{pinnedOlder.active.version} ({pinnedOlder.active.name}). Your most recent is v
                {pinnedOlder.newest.version}.
              </p>
            )}
            <FilePick label="Tailored resume" hint="The Jobright export to reformat" file={source} onPick={setSource} />
            <FilePick
              label={active ? "One-off template (optional)" : "Template"}
              hint={active ? "Overrides the saved template, saves nothing" : "Your resume, whose formatting to copy"}
              file={template}
              onPick={setTemplate}
            />
            <button
              onClick={reformat}
              disabled={!source || (!template && !active) || busy !== null}
              className="w-full bg-accent text-white rounded-xl px-5 py-4 text-base font-medium disabled:opacity-50"
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
                    ? "bg-white border-line"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                }`}
              >
                <p className="font-medium">
                  {result.coverage.percent}% of the source placed ({result.coverage.placed} of{" "}
                  {result.coverage.totalParagraphs} paragraphs)
                </p>
                {result.coverage.dropped.length > 0 ? (
                  <div className="mt-2 flex flex-col gap-1">
                    <p>Not carried across — check these before you send it:</p>
                    <ul className="list-disc pl-5">
                      {result.coverage.dropped.map((d, i) => (
                        <li key={i} className="break-words">{d}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="opacity-70 mt-1">Every line made it across. Wording is untouched.</p>
                )}
              </section>

              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">ATS check on the output</h2>
                <Findings findings={result.findings} />
              </section>

              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">What went in</h2>
                <div className="bg-white border border-line rounded-xl p-4 flex flex-col gap-2">
                  <p className="text-sm">
                    <span className="opacity-60">Name:</span> <span className="font-medium">{result.summary.name ?? "not found"}</span>
                  </p>
                  <ul className="flex flex-col divide-y divide-line">
                    {result.summary.sections.map((s) => (
                      <li key={s.label} className="py-2 flex items-baseline justify-between gap-3">
                        <span className="font-medium">{s.label}</span>
                        <span className="text-sm opacity-60 whitespace-nowrap">
                          {s.count} {s.kind === "entries" ? "role" : s.kind === "prose" ? "paragraph" : "item"}
                          {s.count === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <div className="flex flex-col gap-2">
                <button onClick={download} className="w-full bg-accent text-white rounded-xl px-5 py-4 text-base font-medium">
                  Download {result.filename}
                </button>
                <p className="text-xs opacity-60">
                  Rendered with {result.templateLabel}.{" "}
                  {result.renderId ? "Saved to your render history." : "Preview only — nothing was saved."}
                </p>
              </div>
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
              Every upload is a new version and becomes active. Templates are never deleted, so an older one is
              always one tap away.
            </p>
          </section>

          {pinnedOlder && (
            <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3">
              v{pinnedOlder.active.version} is pinned active, but v{pinnedOlder.newest.version} is newer.
            </p>
          )}

          <section className="flex flex-col gap-2">
            {templates === null && <p className="text-sm opacity-60">Loading…</p>}
            {templates?.length === 0 && (
              <p className="text-sm bg-white border border-line rounded-xl px-4 py-3">
                No templates yet. Add the resume whose look you want everything to match.
              </p>
            )}
            {templates?.map((t) => (
              <div key={t.id} className="bg-white border border-line rounded-xl px-4 py-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium break-all">
                      {t.name} <span className="opacity-60 font-normal">v{t.version}</span>
                    </p>
                    <p className="text-xs opacity-60 mt-0.5">
                      {t.spec.font} {t.spec.bodySize}pt · headings {t.spec.headingSize}pt · margins{" "}
                      {t.spec.margins.left}&quot; · {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {t.is_active ? (
                    <span className="text-xs bg-accent text-white rounded-full px-2.5 py-1 whitespace-nowrap">Active</span>
                  ) : (
                    <button
                      onClick={() => activate(t.id)}
                      className="text-xs underline whitespace-nowrap opacity-80"
                    >
                      Make active
                    </button>
                  )}
                </div>
              </div>
            ))}
          </section>
        </>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <FilePick label="Any .docx" hint="See how a parser reads it" file={single} onPick={check} />
          </section>

          {inspection && (
            <>
              <section className="bg-white border border-line rounded-xl p-4 flex flex-col gap-1">
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
                <h2 className="text-lg font-semibold">What the parser read</h2>
                <div className="bg-white border border-line rounded-xl p-4 flex flex-col gap-2">
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
