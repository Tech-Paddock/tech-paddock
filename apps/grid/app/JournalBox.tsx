"use client";

import { useEffect, useState } from "react";
import { nextPromptIndex, PROMPTS } from "@/lib/prompts";
import type { JournalEntry } from "@/lib/types";
import { uuid } from "@/lib/uuid";
import type { Send } from "./outbox";

/**
 * The journal: a blank page, and underneath it today's entries.
 *
 * - **An edit is a new version** (RULES.md, Never 1). Edit loads an entry's
 *   newest words into the page; Save sends them as another version of the same
 *   entry. Nothing here updates or deletes; the versions stay and are listed.
 * - **What is typed is not lost before it is saved:** the page keeps an unsent
 *   draft for the day in this browser's storage, and Save hands the entry to the
 *   outbox, which keeps it until the server has it.
 * - "Give me a prompt" shows one line from a fixed list above the page. It is
 *   never written into the page.
 */
const draftKey = (day: string) => `grid.draft.${day}`;

function readDraft(day: string): string {
  try {
    return window.localStorage.getItem(draftKey(day)) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(day: string, text: string) {
  try {
    if (text) window.localStorage.setItem(draftKey(day), text);
    else window.localStorage.removeItem(draftKey(day));
  } catch {
    // No storage: the draft lives until the tab closes.
  }
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function JournalBox({ entries, day, send }: { entries: JournalEntry[]; day: string; send: Send }) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<number | null>(null);

  useEffect(() => setText(readDraft(day)), [day]);

  function change(v: string) {
    setText(v);
    if (editing == null) writeDraft(day, v);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    void send(editing ? "Journal entry (new version)" : "Journal entry", "/api/journal", {
      op: "save",
      id: uuid(),
      entry_id: editing ?? uuid(),
      day,
      body: text,
    });
    setText("");
    setEditing(null);
    writeDraft(day, "");
  }

  function edit(entry: JournalEntry) {
    setText(entry.versions[entry.versions.length - 1].body);
    setEditing(entry.entry_id);
  }

  function cancel() {
    setText(readDraft(day));
    setEditing(null);
  }

  return (
    <section aria-labelledby="journal-h" className="rounded-2xl border border-line bg-surface p-4">
      <h2 id="journal-h" className="text-lg font-semibold">
        Journal
      </h2>
      {prompt != null && <p className="mt-2 rounded-lg bg-raised px-3 py-2 text-sm italic">{PROMPTS[prompt]}</p>}
      <form onSubmit={save} className="mt-2 flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => change(e.target.value)}
          aria-label="Journal page"
          rows={6}
          maxLength={20000}
          className="min-h-40 w-full rounded-lg border border-line bg-paper p-3 leading-relaxed outline-none focus:border-accent"
        />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={!text.trim()} className="min-h-11 rounded-lg bg-accent px-4 font-medium text-accent-ink disabled:opacity-50">
            {editing ? "Save new version" : "Save"}
          </button>
          {editing && (
            <button type="button" onClick={cancel} className="min-h-11 px-2 text-ink/70 underline">
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => setPrompt((p) => nextPromptIndex(p))}
            className="ml-auto min-h-11 text-sm text-ink/70 underline"
          >
            {prompt == null ? "Give me a prompt" : "Another prompt"}
          </button>
        </div>
      </form>

      {entries.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3">
          {entries.map((entry) => {
            const latest = entry.versions[entry.versions.length - 1];
            return (
              <li key={entry.entry_id} className="border-t border-line/40 pt-3">
                <p className="whitespace-pre-wrap break-words">{latest.body}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-ink/70">
                  <span>{timeOf(latest.created_at)}</span>
                  <button
                    type="button"
                    onClick={() => edit(entry)}
                    disabled={text.trim() !== ""}
                    title={text.trim() !== "" ? "Save or clear the page first" : undefined}
                    className="min-h-11 underline disabled:no-underline disabled:opacity-50"
                  >
                    Edit
                  </button>
                </div>
                {entry.versions.length > 1 && (
                  <details className="text-xs text-ink/70">
                    <summary className="min-h-11 cursor-pointer py-3">{entry.versions.length} versions</summary>
                    <ol className="flex flex-col gap-2">
                      {entry.versions.map((v, i) => (
                        <li key={v.id} className="rounded-lg bg-paper p-2">
                          <span className="font-medium">
                            Version {i + 1}, {timeOf(v.created_at)}
                          </span>
                          <p className="mt-1 whitespace-pre-wrap break-words text-ink">{v.body}</p>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
