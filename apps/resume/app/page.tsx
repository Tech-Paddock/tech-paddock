"use client";

import { useRef, useState } from "react";

type Finding = { code: string; severity: "blocking" | "warning"; message: string };
type Section = { heading: string; lines: number; bullets: number };
type Report = {
  filename: string;
  sizeBytes: number;
  paragraphCount: number;
  namedStyles: number;
  outline: { title: string | null; sections: Section[]; preamble: string[] };
  findings: Finding[];
};

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

export default function Home() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function inspect(file: File) {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/inspect", { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Upload failed (${res.status}).`);
      setReport(data as Report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong reading that file.");
    } finally {
      setBusy(false);
    }
  }

  const blocking = report?.findings.filter((f) => f.severity === "blocking") ?? [];
  const warnings = report?.findings.filter((f) => f.severity === "warning") ?? [];

  return (
    <main className="min-h-screen px-5 py-8 max-w-3xl mx-auto flex flex-col gap-7">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Resume Formatter</h1>
        <p className="text-sm opacity-70">
          Drop in a .docx to see how a parser reads it, and what would cost you in an ATS.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <input
          ref={input}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) inspect(file);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className="w-full bg-accent text-white rounded-xl px-5 py-4 text-base font-medium disabled:opacity-60"
        >
          {busy ? "Reading…" : "Choose a .docx"}
        </button>
        <p className="text-xs opacity-60">
          Works on a Jobright export or your own template. Nothing is stored — the file is read and discarded.
        </p>
      </section>

      {error && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
      )}

      {report && (
        <>
          <section className="bg-white border border-line rounded-xl p-4 flex flex-col gap-1">
            <p className="font-medium break-all">{report.filename}</p>
            <p className="text-sm opacity-70">
              {mb(report.sizeBytes)} · {report.paragraphCount} paragraphs ·{" "}
              {report.namedStyles === 0 ? "no named styles" : `${report.namedStyles} named styles`}
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">
              ATS check{" "}
              <span className="text-sm font-normal opacity-70">
                {blocking.length === 0 && warnings.length === 0
                  ? "— nothing found"
                  : `— ${blocking.length} blocking, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`}
              </span>
            </h2>
            {blocking.length === 0 && warnings.length === 0 && (
              <p className="text-sm bg-white border border-line rounded-xl px-4 py-3">
                No structural problems found. Single column, no tables beyond the permitted one, contact details in
                the body.
              </p>
            )}
            {[...blocking, ...warnings].map((f) => (
              <div
                key={f.code}
                className={`rounded-xl px-4 py-3 border text-sm ${
                  f.severity === "blocking"
                    ? "bg-red-50 border-red-200 text-red-900"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                }`}
              >
                <p className="font-medium mb-1">
                  {f.severity === "blocking" ? "Blocking" : "Warning"} · {f.code.replace(/_/g, " ")}
                </p>
                <p>{f.message}</p>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">What the parser read</h2>
            <div className="bg-white border border-line rounded-xl p-4 flex flex-col gap-3">
              <p className="text-sm">
                <span className="opacity-60">Name detected:</span>{" "}
                <span className="font-medium">{report.outline.title ?? "none"}</span>
              </p>
              {report.outline.preamble.length > 0 && (
                <p className="text-sm opacity-70 break-words">
                  <span className="opacity-80">Before the first heading:</span> {report.outline.preamble[0]}
                </p>
              )}
              <ul className="flex flex-col divide-y divide-line">
                {report.outline.sections.map((s) => (
                  <li key={s.heading} className="py-2 flex items-baseline justify-between gap-3">
                    <span className="font-medium">{s.heading}</span>
                    <span className="text-sm opacity-60 whitespace-nowrap">
                      {s.lines} line{s.lines === 1 ? "" : "s"}
                      {s.bullets > 0 && ` · ${s.bullets} bullet${s.bullets === 1 ? "" : "s"}`}
                    </span>
                  </li>
                ))}
              </ul>
              {report.outline.sections.length === 0 && (
                <p className="text-sm opacity-70">No section headings recognised in this document.</p>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
