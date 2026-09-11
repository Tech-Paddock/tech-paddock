"use client";

import { useRef, useState } from "react";

type Finding = { code: string; severity: "blocking" | "warning"; message: string };
type Coverage = { totalParagraphs: number; placed: number; dropped: string[]; percent: number };
type SectionSummary = { label: string; kind: string; count: number };

type Reformatted = {
  filename: string;
  coverage: Coverage;
  findings: Finding[];
  summary: { name: string | null; contact: string | null; sections: SectionSummary[] };
  docxBase64: string;
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
  const [tab, setTab] = useState<"reformat" | "check">("reformat");
  const [template, setTemplate] = useState<File | null>(null);
  const [source, setSource] = useState<File | null>(null);
  const [single, setSingle] = useState<File | null>(null);
  const [result, setResult] = useState<Reformatted | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
    if (!template || !source) return;
    setResult(null);
    const body = new FormData();
    body.append("template", template);
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

  return (
    <main className="min-h-screen px-5 py-8 max-w-3xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Resume Formatter</h1>
        <p className="text-sm opacity-70">
          Put a tailored resume into your own template, without losing a word of it.
        </p>
      </header>

      <nav className="flex gap-1 bg-white border border-line rounded-xl p-1">
        {(["reformat", "check"] as const).map((t) => (
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
            {t === "reformat" ? "Reformat" : "ATS check"}
          </button>
        ))}
      </nav>

      {error && <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      {tab === "reformat" ? (
        <>
          <section className="flex flex-col gap-3">
            <FilePick label="Template" hint="Your resume, whose formatting to copy" file={template} onPick={setTemplate} />
            <FilePick label="Tailored resume" hint="The Jobright export to reformat" file={source} onPick={setSource} />
            <button
              onClick={reformat}
              disabled={!template || !source || busy !== null}
              className="w-full bg-accent text-white rounded-xl px-5 py-4 text-base font-medium disabled:opacity-50"
            >
              {busy ?? "Reformat"}
            </button>
            <p className="text-xs opacity-60">
              Nothing is stored yet — both files are read and discarded, so pick them each time for now.
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

              <button onClick={download} className="w-full bg-accent text-white rounded-xl px-5 py-4 text-base font-medium">
                Download {result.filename}
              </button>
            </>
          )}
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
