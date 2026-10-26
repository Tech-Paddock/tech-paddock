import type { Metadata } from "next";
import Shell from "../Shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paddock — Cookbook · Deals",
};

/** Deals, at an address of its own (TEC-132), after Your brands. */
export default function DealsPage() {
  return <Shell tab="deals" />;
}
