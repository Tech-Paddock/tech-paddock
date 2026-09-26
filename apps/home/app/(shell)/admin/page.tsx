import { redirect } from "next/navigation";

/** The Garage is a tab on home now. The old address still gets you there. */
export default function AdminPage() {
  redirect("/?tab=garage");
}
