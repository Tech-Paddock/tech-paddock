/** The most lines one mirror request resolves (TEC-227), so one call can never fan out into a hundred Kroger searches. The page asks in batches of this size. */
export const MIRROR_MAX = 30;
