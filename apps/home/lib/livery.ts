import type { Livery } from "./theme";

/**
 * Home and /admin wear Martini. Fixed at build time, not a preference —
 * see lib/theme.ts for why livery is per app and only polarity is shared.
 */
export const LIVERY: Livery = "martini";
