import { TOOLS, type ToolSlug } from "@/lib/platform";

/**
 * The tools as the shell presents them: names and URLs from `lib/platform.ts`,
 * plus an icon.
 *
 * A plain module rather than part of `Chrome.tsx` because both sides need it:
 * the sidebar is a client component, and the landing page resolves `?app=` on
 * the server so a framed tool renders without waiting on any landing data. A
 * function exported from a `"use client"` file cannot be called on the server.
 *
 * Typing this as a Record over ToolSlug means adding a tool to `platform.ts`
 * breaks the build until it is given an icon, rather than rendering a nameless
 * blank in the sidebar.
 *
 * An icon is an emoji, or `image`: a path under `public/` for a tool whose own
 * logo stands in for one. The image is a local copy of the tool's icon, not a
 * link to its subdomain: every tool's assets sit behind its own gate, and a
 * cross-origin fetch from here would break the day that gate tightens. Re-copy
 * it when the tool's logo changes (Lando: `apps/lando/app/icon.svg`).
 */
type Presentation = { icon: string; image?: undefined } | { image: string; icon?: undefined };

const PRESENTATION: Record<ToolSlug, Presentation> = {
  resume: { icon: "📄" },
  coffee: { icon: "☕" },
  health: { icon: "🥗" },
  cookbook: { icon: "📖" },
  lando: { image: "/lando-icon.svg" },
};

export const APPS = TOOLS.map((tool) => ({
  slug: tool.slug,
  name: tool.name,
  href: tool.url,
  ...PRESENTATION[tool.slug],
}));

/** Which tool `?app=` names, or null for the landing. */
export function selectedIndexFrom(slug: string | null | undefined) {
  const i = APPS.findIndex((a) => a.slug === slug);
  return i === -1 ? null : i;
}
