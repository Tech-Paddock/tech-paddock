import { vi } from "vitest";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null };

export type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };

/**
 * A stand-in for the Supabase query builder.
 *
 * These tests exist to cover the logic around the database — write ordering,
 * branch selection, error mapping — not Postgres itself. Anything that depends
 * on real SQL semantics (the partial unique index, foreign keys) is deliberately
 * out of scope here and only exercised against the real project.
 */
export function fakeSupabase(tables: Record<string, Result | ((call: Call) => Result)>) {
  const calls: Call[] = [];

  const builder = (table: string, op: string, payload?: unknown) => {
    const call: Call = { table, op, payload, filters: [] };
    calls.push(call);

    const resolve = (): Result => {
      const entry = tables[`${table}.${op}`] ?? tables[table];
      if (!entry) return { data: null, error: null };
      return typeof entry === "function" ? entry(call) : entry;
    };

    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      in: () => chain,
      eq: (column: string, value: unknown) => {
        call.filters.push([column, value]);
        return chain;
      },
      single: () => Promise.resolve(resolve()),
      maybeSingle: () => Promise.resolve(resolve()),
      then: (onFulfilled: (r: Result) => unknown) => Promise.resolve(resolve()).then(onFulfilled),
    };
    return chain;
  };

  const client = {
    from: (table: string) => ({
      select: (..._args: unknown[]) => builder(table, "select"),
      insert: (payload: Row) => builder(table, "insert", payload),
      update: (payload: Row) => builder(table, "update", payload),
    }),
  };

  return { client, calls };
}

/** Records the order side effects happen in, so "storage before row" is testable. */
export function orderTracker() {
  const order: string[] = [];
  return { order, mark: (label: string) => order.push(label) };
}

export const mockModules = (overrides: {
  resume?: unknown;
  tracker?: unknown;
  upload?: (...args: unknown[]) => Promise<string>;
  download?: (...args: unknown[]) => Promise<Buffer>;
}) => {
  vi.doMock("@/lib/supabase", () => ({
    getServiceClient: () => overrides.resume,
    getTrackerClient: () => overrides.tracker,
    getSharedClient: () => overrides.tracker,
  }));
  vi.doMock("@/lib/storage", async () => {
    const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
    return {
      ...actual,
      uploadDocx: overrides.upload ?? (async () => "path/x.docx"),
      downloadDocx: overrides.download ?? (async () => Buffer.from("x")),
    };
  });
};
