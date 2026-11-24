/**
 * A stand-in for the Supabase client that records every call and answers each
 * query from a function of what was asked. Every method returns the same
 * thenable, so any builder chain works, and awaiting it gives the result.
 * Fixtures are invented; nothing here is a real task, entry or name.
 */
export type Call = { table: string; ops: [string, unknown[]][] };
type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

export function fakeDb(answer: (call: Call) => Result = () => ({ data: [], error: null })) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const q: unknown = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "then") {
              return (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) =>
                Promise.resolve(answer(call)).then((r) => resolve({ data: null, error: null, ...r }), reject);
            }
            return (...args: unknown[]) => {
              call.ops.push([prop, args]);
              return q;
            };
          },
        },
      );
      return q;
    },
  };
  return { db: db as never, calls };
}

export const has = (call: Call, op: string, ...args: unknown[]) =>
  call.ops.some(([name, a]) => name === op && args.every((x, i) => JSON.stringify(a[i]) === JSON.stringify(x)));
