"use client";

import { useRef, useState } from "react";
import { UNITS, displayUnit, type JournalEvent, type Unit } from "@/lib/events";
import { fromLocalInput, toLocalInput } from "@/lib/localtime";

export type SaveResult = { error: string | null };

type Props = {
  event: JournalEvent;
  people: { id: string; display_name: string }[];
  /** Everything read, for the unit a new weight defaults to. */
  events: JournalEvent[];
  onSave: (body: Record<string, unknown>) => Promise<SaveResult>;
  onClose: () => void;
};

/**
 * Details after the tap. Saving writes a **new** event that voids this one;
 * deleting writes a `void`. Nothing is overwritten (charter, Never 1).
 *
 * Each action's id is fixed when the editor opens, so pressing Save again
 * after a lost response cannot write the correction twice.
 */
export default function Editor({ event, people, events, onSave, onClose }: Props) {
  const d = event.details;
  const [at, setAt] = useState(toLocalInput(event.at));
  const [personId, setPersonId] = useState(event.person_id ?? "");
  const [note, setNote] = useState(event.note ?? "");
  const [amount, setAmount] = useState(d.amount ?? "");
  const [practised, setPractised] = useState(d.practised ?? "");
  const [what, setWhat] = useState<string>(d.what ?? "");
  const [value, setValue] = useState(typeof d.value === "number" ? String(d.value) : "");
  const [unit, setUnit] = useState<Unit>(d.unit ?? displayUnit(events));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const correctionId = useRef(crypto.randomUUID());
  const deleteId = useRef(crypto.randomUUID());

  function details(): Record<string, unknown> {
    switch (event.kind) {
      case "meal":
        return { amount };
      case "training":
        return { practised };
      case "accident":
        return what ? { what } : {};
      case "weight": {
        if (!value.trim()) return {};
        return { value: Number(value.replace(",", ".")), unit };
      }
      default:
        return {};
    }
  }

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const { error } = await onSave(body);
    setBusy(false);
    if (error) setError(error);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const when = fromLocalInput(at);
    if (!when) {
      setError("pick a time");
      return;
    }
    if (event.kind === "weight" && value.trim() && !(Number(value.replace(",", ".")) > 0)) {
      setError("weight must be a number above 0");
      return;
    }
    void run({
      id: correctionId.current,
      kind: event.kind,
      voids: event.id,
      at: when,
      person_id: personId || null,
      details: details(),
      note: note || null,
    });
  }

  function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    void run({ id: deleteId.current, kind: "void", voids: event.id, person_id: personId || null });
  }

  const field = "w-full rounded-lg border border-line bg-paper px-2 py-1.5 outline-none focus:border-accent";

  return (
    <form onSubmit={save} className="flex flex-col gap-3 border-t border-line px-3 py-3">
      {event.kind === "weight" && (
        <div className="flex gap-2">
          <input
            autoFocus
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Weight"
            aria-label="Weight"
            className={field}
          />
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label="Unit" className="rounded-lg border border-line bg-paper px-2">
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
      )}
      {event.kind === "meal" && (
        <input autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} maxLength={60} placeholder="Amount (e.g. 1 cup)" aria-label="Amount" className={field} />
      )}
      {event.kind === "training" && (
        <input autoFocus value={practised} onChange={(e) => setPractised(e.target.value)} maxLength={120} placeholder="What was practised" aria-label="What was practised" className={field} />
      )}
      {event.kind === "accident" && (
        <select value={what} onChange={(e) => setWhat(e.target.value)} aria-label="Pee or poop" className={field}>
          <option value="">Pee or poop?</option>
          <option value="pee">Pee</option>
          <option value="poop">Poop</option>
        </select>
      )}
      <div className="flex gap-2">
        <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Time" className={field} />
        <select value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label="Who" className={field}>
          <option value="">Who?</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note" aria-label="Note" className={field} />
      {error && <p className="text-sm text-urgent">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-ink disabled:opacity-60">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onClose} className="px-2 py-2 text-ink-soft">
          Close
        </button>
        <button type="button" onClick={remove} disabled={busy} className="ml-auto px-2 py-2 text-danger disabled:opacity-60">
          {confirmDelete ? "Tap again to delete" : "Delete"}
        </button>
      </div>
    </form>
  );
}
