import Shell from "./Shell";

export const dynamic = "force-dynamic";

/** The book. `/list` is the other tab's address; both render `Shell`. */
export default function Page() {
  return <Shell tab="recipes" />;
}
