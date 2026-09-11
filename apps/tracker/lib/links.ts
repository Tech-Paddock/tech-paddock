/**
 * Deep links out to the tool that owns each piece of work.
 *
 * These are absolute on purpose: the hub renders the same links from a
 * different origin, so a relative path would resolve against the wrong host.
 * Bases are overridable per environment but default to the live subdomains, so
 * nothing here needs new Vercel config to work.
 */

const base = (value: string | undefined, fallback: string) =>
  (value ?? fallback).replace(/\/+$/, "");

export function trackerBase() {
  return base(process.env.TRACKER_BASE_URL, "https://tracker.techpaddock.io");
}

export function editorBase() {
  return base(process.env.EDITOR_BASE_URL, "https://editor.techpaddock.io");
}

export function resumeBase() {
  return base(process.env.RESUME_BASE_URL, "https://resume.techpaddock.io");
}

export const links = {
  dashboard: () => `${trackerBase()}/dashboard`,
  threads: () => `${trackerBase()}/`,
  thread: (id: string) => `${trackerBase()}/?thread=${encodeURIComponent(id)}`,
  /** Opens the editor with the contact preselected, ready to draft. */
  draftTo: (contactId: string) => `${editorBase()}/?contact=${encodeURIComponent(contactId)}`,
  renderHistory: () => `${resumeBase()}/?tab=history`,
  render: (id: string) => `${resumeBase()}/?tab=history&render=${encodeURIComponent(id)}`,
  templates: () => `${resumeBase()}/?tab=templates`,
};
