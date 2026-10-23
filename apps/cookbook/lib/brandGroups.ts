import { byRank, defaultFor, namingHint, normalizeName, type SavedProduct } from "./brands";
import { describeDrift, parseSize, sizeDrift } from "./sizeDrift";

/**
 * Your brands as the tab shows it (TEC-135; the owner's mockup of 2026-10-23):
 * **groups of products that share a name**, each with its default, and a
 * **Fix these** panel of rows that need a look. Pure and browser-safe (no
 * database import), so `app/Brands.tsx` runs it and the tests hold it.
 *
 * - **A group** is every product reachable through a shared name: Original
 *   and Sourdough both carry "english muffins". Its title is the shared name
 *   most of them carry. A product sharing no name is a group of one.
 * - **The default** is the group's title name's default (`defaultFor`).
 *   *Make default* on a product sets it for every shared name it carries, so
 *   "coke zero" and "coke" move together.
 * - **The hint** on a product that is not the default is what to put on the
 *   line to get it: *when the line says "sourdough"* (`namingHint`).
 * - **Fix these**: a size that changed since it was first bought, a product
 *   Kroger no longer returns (with its closest replacement), and any row whose
 *   note starts `check:` — the seed's own flag for a match it doubted.
 */

export type GroupMember = {
  product: SavedProduct;
  isDefault: boolean;
  /** The words that pick it over the default, when it is not the default and such words exist. */
  hint: string | null;
};

export type BrandGroup = {
  key: string;
  /** The shared name most products carry, as first spelled; a lone product's first name. */
  title: string;
  /** Every name two or more of its products share, as matched. What Make default sets. */
  shared: string[];
  members: GroupMember[];
  /** Two or more products and no default for the title name. */
  needsDefault: boolean;
};

export type FixKind = "shrank" | "grew" | "resized" | "gone" | "check";

export type FixItem = { kind: FixKind; product: SavedProduct; title: string; detail: string };

/** The product's short name: Kroger's, else its first. */
export function shortName(p: SavedProduct): string {
  return p.description ?? p.names[0] ?? p.product_id;
}

/** Products joined through shared names (union-find over names as matched). */
function components(products: SavedProduct[]): SavedProduct[][] {
  const parent = products.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const holder = new Map<string, number>();
  products.forEach((p, i) => {
    for (const name of p.names) {
      const n = normalizeName(name);
      const j = holder.get(n);
      if (j === undefined) holder.set(n, i);
      else parent[find(i)] = find(j);
    }
  });
  const out = new Map<number, SavedProduct[]>();
  products.forEach((p, i) => {
    const root = find(i);
    out.set(root, [...(out.get(root) ?? []), p]);
  });
  return [...out.values()];
}

export function brandGroups(products: SavedProduct[]): BrandGroup[] {
  const groups = components(products).map((members): BrandGroup => {
    const carriers = new Map<string, { spelled: string; count: number }>();
    for (const p of members) {
      for (const name of p.names) {
        const n = normalizeName(name);
        const seen = carriers.get(n);
        carriers.set(n, { spelled: seen?.spelled ?? name, count: (seen?.count ?? 0) + 1 });
      }
    }
    const shared = [...carriers.entries()].filter(([, c]) => c.count > 1).map(([n]) => n);
    const ranked = [...members].sort(byRank);
    // The title: the shared name most carry, the shortest on a tie; alone, the first name.
    const titleKey =
      shared.length > 0
        ? [...shared].sort((a, b) => carriers.get(b)!.count - carriers.get(a)!.count || a.length - b.length || a.localeCompare(b))[0]
        : normalizeName(ranked[0].names[0] ?? ranked[0].product_id);
    const title = carriers.get(titleKey)?.spelled ?? ranked[0].names[0] ?? ranked[0].product_id;
    const def = members.length > 1 ? defaultFor(titleKey, members) : null;
    const ordered = def ? [def, ...ranked.filter((p) => p !== def)] : ranked;
    return {
      key: ranked[0].id,
      title,
      shared,
      needsDefault: members.length > 1 && !def,
      members: ordered.map((p) => ({
        product: p,
        isDefault: members.length === 1 || p === def,
        hint: members.length > 1 && p !== def ? namingHint(p, members, shared) : null,
      })),
    };
  });
  return groups.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
}

/** The shared names this product carries: what its Make default sets. */
export function defaultNames(group: BrandGroup, p: SavedProduct): string[] {
  const carried = new Set(p.names.map(normalizeName));
  return group.shared.filter((n) => carried.has(n));
}

/** Fix these, in this order: size changes, products Kroger no longer returns, then `check:` notes. */
export function fixThese(products: SavedProduct[]): FixItem[] {
  const resized: FixItem[] = [];
  const gone: FixItem[] = [];
  const check: FixItem[] = [];
  for (const p of products) {
    const drift = sizeDrift(p.size_first, p.size, p.price);
    if (drift) {
      const was = parseSize(drift.was);
      const now = parseSize(drift.now);
      const kind: FixKind =
        was && now && was.dimension === now.dimension ? (now.amount < was.amount ? "shrank" : now.amount > was.amount ? "grew" : "resized") : "resized";
      resized.push({ kind, product: p, title: `${shortName(p)} · ${kind === "resized" ? "changed size" : kind}`, detail: describeDrift(drift) });
    }
    if (p.missing_since) {
      gone.push({
        kind: "gone",
        product: p,
        title: `${shortName(p)} · gone`,
        detail: `Kroger stopped returning it${p.successor ? ` · closest: ${p.successor.description}` : " · edit it with a new product page"}`,
      });
    }
    const note = p.note?.trim() ?? "";
    if (/^check:/i.test(note)) {
      const said = note.replace(/^check:\s*/i, "");
      check.push({ kind: "check", product: p, title: `${p.names[0] ?? shortName(p)} · check it`, detail: `${said ? `${said} · ` : ""}paste the right page` });
    }
  }
  return [...resized, ...gone, ...check];
}
