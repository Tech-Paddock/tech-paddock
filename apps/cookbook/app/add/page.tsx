import type { Metadata } from "next";
import Shell from "../Shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paddock — Cookbook · Add",
};

/** The Add tab, at an address of its own like the other two (Joel, 2026-10-05). */
export default function AddPage() {
  return <Shell tab="add" />;
}
