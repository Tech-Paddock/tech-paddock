/**
 * Which saved products or search words decide a line. **One copy** for the
 * cart review, the estimate, the deal scan and the list's links (TEC-121), so
 * a line is priced as exactly what Send would put in the cart. The rule is
 * `decide` in `lib/brands.ts` (TEC-131).
 */
export { decide, decider } from "./brands";
