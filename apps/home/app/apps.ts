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
 */
const PRESENTATION: Record<ToolSlug, { icon: string }> = {
  resume: { icon: "📄" },
  coffee: { icon: "☕" },
  health: { icon: "🥗" },
  cookbook: { icon: "📖" },
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
