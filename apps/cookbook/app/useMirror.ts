"use client";

import { useEffect, useRef, useState } from "react";
import { MIRROR_MAX } from "@/lib/mirrorLimit";
import type { MirrorRow } from "@/lib/mirrorWords";
import { serialKroger } from "./Cart";

/** The part of a List line the mirror depends on: change any of it and the row is worked out again. */
type MirrorLine = { id: string; name: string; note: string | null; checked: boolean; sent_at: string | null; picked?: { upc: string } | null };

/** A line's signature: what it reads as, and which product is picked for it. */
export function mirrorKey(l: Pick<MirrorLine, "name" | "note" | "picked">): string {
  return `${l.name}\u0000${l.note ?? ""}\u0000${l.picked?.upc ?? ""}`;
}

type Entry = { key: string; row: MirrorRow; at: number };

/**
 * **The grey rows In cart** (TEC-227): for each unsent, unticked List line, the product a send
 * would put in the cart now, from `GET /api/kroger/mirror`.
 *
 * - **Batched:** one request per `MIRROR_MAX` lines, never one per line, and only for lines not
 *   already worked out. A tick, a quantity change or a reload asks for nothing new.
 * - **Inside `serialKroger`,** with every other call that borrows the account's token.
 * - **Cached by what the line reads as and its pick** (`mirrorKey`). A new pick, or a line typed
 *   or edited, is worked out again alone. Everything is dropped when `refreshKey` changes (Your
 *   brands or the list was edited elsewhere), and an `unknown` answer is tried again after the next
 *   reload (`reloads`).
 * - **A failure degrades to `unknown`,** so the row reads the plain word; it never blocks or
 *   breaks the list.
 *
 * `enabled` is false until the King Soopers connection and store are ready.
 */
export function useMirror(lines: MirrorLine[] | null, { enabled, refreshKey, reloads }: { enabled: boolean; refreshKey: number; reloads: number }) {
  const [rows, setRows] = useState<Map<string, Entry>>(new Map());
  const asking = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Everything is stale when the list or Your brands changed somewhere else.
  const seenKey = useRef(refreshKey);
  useEffect(() => {
    if (seenKey.current === refreshKey) return;
    seenKey.current = refreshKey;
    asking.current.clear();
    setRows(new Map());
  }, [refreshKey]);

  useEffect(() => {
    if (!enabled || lines === null) return;
    const todo = lines.filter((l) => {
      if (l.sent_at !== null || l.checked) return false;
      const have = rows.get(l.id);
      const fresh = have && have.key === mirrorKey(l) && (have.row.state !== "unknown" || have.at === reloads);
      return !fresh && !asking.current.has(`${l.id}:${mirrorKey(l)}:${reloads}`);
    });
    if (todo.length === 0) return;

    for (let i = 0; i < todo.length; i += MIRROR_MAX) {
      const batch = todo.slice(i, i + MIRROR_MAX);
      for (const l of batch) asking.current.add(`${l.id}:${mirrorKey(l)}:${reloads}`);
      void (async () => {
        let got: MirrorRow[] = [];
        try {
          const response = await serialKroger(() => fetch(`/api/kroger/mirror?ids=${encodeURIComponent(batch.map((l) => l.id).join(","))}`, { cache: "no-store" }));
          const body = await response.json().catch(() => ({}));
          if (response.ok && Array.isArray(body.rows)) got = body.rows as MirrorRow[];
        } catch {
          // Degrades to the plain word below.
        }
        for (const l of batch) asking.current.delete(`${l.id}:${mirrorKey(l)}:${reloads}`);
        if (!mounted.current) return;
        const byId = new Map(got.map((r) => [r.id, r]));
        setRows((current) => {
          const next = new Map(current);
          for (const l of batch) next.set(l.id, { key: mirrorKey(l), row: byId.get(l.id) ?? { id: l.id, state: "unknown" }, at: reloads });
          return next;
        });
      })();
    }
    // `rows` is a dependency so a late answer for a line whose pick has since changed is worked out again;
    // an answer, even `unknown`, counts as known until the next reload, so this never loops.
  }, [lines, enabled, reloads, rows]);

  /** The row for a line, or null while it is being worked out or its pick has changed since. */
  return (l: Pick<MirrorLine, "id" | "name" | "note" | "picked">): MirrorRow | null => {
    const have = rows.get(l.id);
    return have && have.key === mirrorKey(l) ? have.row : null;
  };
}
