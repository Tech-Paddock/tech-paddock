// #71: a circular import between app files crashed every signed-in page on a module-level const read before it was
// initialised ("Cannot access 'aV' before initialization"). Build the static import graph of app/ and lib/ and fail on any cycle.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const root = resolve(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "node_modules" ? [] : files(p);
    return /\.(tsx?|mjs)$/.test(n) ? [p] : [];
  });
}

function resolveSpec(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(root, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/** Value imports only: `import type ...` and `import { type A, type B }` are erased at build and cannot loop. */
function valueImports(src: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[3] !== undefined) {
      if (m[1]) continue;
      const names = m[2].match(/\{([^}]*)\}/)?.[1];
      const hasDefaultOrStar = /^(\*|[A-Za-z_$])/.test(m[2].trim());
      if (names !== undefined && !hasDefaultOrStar && names.split(",").map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith("type "))) continue;
      out.push(m[3]);
    } else out.push((m[4] ?? m[5]) as string);
  }
  return out;
}

function cycles(): string[][] {
  const all = [...files(join(root, "app")), ...files(join(root, "lib"))];
  const graph = new Map<string, string[]>();
  for (const f of all) {
    graph.set(f, valueImports(readFileSync(f, "utf8")).map((s) => resolveSpec(f, s)).filter((x): x is string => !!x));
  }
  const found: string[][] = [];
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (f: string) => {
    state.set(f, 1);
    stack.push(f);
    for (const d of graph.get(f) ?? []) {
      if (state.get(d) === 1) found.push([...stack.slice(stack.indexOf(d)), d].map((p) => relative(root, p)));
      else if (!state.has(d)) visit(d);
    }
    stack.pop();
    state.set(f, 2);
  };
  for (const f of graph.keys()) if (!state.has(f)) visit(f);
  return found;
}

describe("import graph", () => {
  it("app/ and lib/ have no import cycle", () => {
    expect(cycles().map((c) => c.join(" -> "))).toEqual([]);
  });
});
