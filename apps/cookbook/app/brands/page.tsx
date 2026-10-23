import type { Metadata } from "next";
import Shell from "../Shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paddock — Cookbook · Your brands",
};

/** Your brands, at an address of its own (TEC-131), after the King Soopers list. */
export default function BrandsPage() {
  return <Shell tab="brands" />;
}
