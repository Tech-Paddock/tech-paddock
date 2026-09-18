import type { Livery } from "./theme";

/**
 * Health wears Senna, and **this is a placeholder TechPad Gen owns.**
 *
 * All five liveries were taken when this app was scaffolded — martini (hub),
 * clark (editor), senna (tracker), mp44 (resume), jps (coffee). Senna is
 * borrowed because `tp-tracker` is paused and being deprecated, so it is the
 * one most likely to come free. Until the tracker actually goes, **two apps
 * wear the same livery**, which is precisely the drift the one-owner theme
 * rule exists to prevent.
 *
 * The fix is TechPad Gen's and it is one of two: a sixth livery, or confirming
 * this one once the tracker is deleted. Scaffolding did not wait on that, per
 * the rule that says duplicate the pattern locally and name it in the pull
 * request rather than blocking on the theme owner.
 */
export const LIVERY: Livery = "senna";
