import type { Livery } from "./theme";

/**
 * Cookbook wears Clark, and **this is a placeholder TechPad Gen owns.**
 *
 * There are five liveries and this is the seventh app, so a borrow was
 * unavoidable at scaffold time. Clark is the editor's, and `apps/editor` is
 * frozen — no longer developed, still deployed — which makes it the one least
 * likely to be looked at beside this one. **It is still a duplicate**, which is
 * exactly the drift the one-owner theme rule exists to prevent.
 *
 * Health made the same borrow on 2026-09-18 and picked Senna on the reasoning
 * that `tp-tracker` was being deprecated. **That reasoning has since expired** —
 * item 10 established on 2026-09-19 that the tracker is deliberately live — so
 * Senna is now double-worn with nothing scheduled to resolve it. Borrowing a
 * second time without saying so would make that two silent duplicates instead
 * of one flagged one.
 *
 * The fix is TechPad Gen's: a sixth and seventh livery, or a deliberate rule
 * that some apps share. It is TEC-12 in Linear rather than left in this comment.
 * Scaffolding did not wait on it, per the rule that says duplicate the pattern
 * locally and name it rather than blocking on the theme owner.
 */
export const LIVERY: Livery = "clark";
