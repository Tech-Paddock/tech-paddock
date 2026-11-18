import { handleWrite } from "@/lib/api";
import { routineEvent, routineGone, sendQuietly, senderFor } from "@/lib/calendar-map";
import { readRoutineForCalendar, writeRoutine } from "@/lib/db";
import { parseRoutine } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(request: Request) {
  return handleWrite(request, parseRoutine, (o) => writeRoutine(o), async (o, req) => {
    if (o.op === "tick") return;
    if (o.op === "archive") {
      await sendQuietly(senderFor(req), routineGone(o.id));
      return;
    }
    // Read back, so a retried add of a routine already retired does not bring its event back.
    const routine = await readRoutineForCalendar(o.id);
    if (routine && !routine.archived_at) await sendQuietly(senderFor(req), routineEvent(routine));
  });
}
