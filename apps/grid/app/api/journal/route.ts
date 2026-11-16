import { handleWrite } from "@/lib/api";
import { writeJournal } from "@/lib/db";
import { parseJournal } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** A save is always a new version of an entry; there is no PATCH or DELETE here (RULES.md, Never 1). */
export function POST(request: Request) {
  return handleWrite(request, parseJournal, (o) => writeJournal(o));
}
