import { handleWrite } from "@/lib/api";
import { choreEvent, choreGone, sendQuietly, senderFor } from "@/lib/calendar-map";
import { readChoreForCalendar, writeChore } from "@/lib/db";
import { parseChore } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(request: Request) {
  return handleWrite(request, parseChore, (o) => writeChore(o), async (o, req) => {
    if (o.op === "retire") {
      await sendQuietly(senderFor(req), choreGone(o.id));
      return;
    }
    // Read back, so a retried add of a chore already retired does not bring its event back.
    const chore = await readChoreForCalendar(o.id);
    if (chore && !chore.archived_at) await sendQuietly(senderFor(req), choreEvent(chore));
  });
}
