import Chrome from "../Chrome";

/**
 * Wraps every route in this group in the hub's topbar and sidebar.
 *
 * A route group rather than the root layout, because `/login` must not get the
 * chrome — it is the pre-auth page, and a sidebar there would offer links the
 * visitor cannot follow. Route groups are invisible in the URL, so these routes
 * are still `/` and `/admin`.
 *
 * Putting the chrome in a layout rather than in each page means it persists
 * across navigation between them instead of remounting.
 */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return <Chrome>{children}</Chrome>;
}
