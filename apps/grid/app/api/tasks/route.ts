import { handleWrite } from "@/lib/api";
import { sendQuietly, senderFor, taskEvent } from "@/lib/calendar-map";
import { readTask, writeTask } from "@/lib/db";
import { parseTask } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(request: Request) {
  return handleWrite(request, parseTask, (o) => writeTask(o), async (o, req) => {
    // A new task with no date has no event, and nothing to take away.
    if (o.op === "add" && !o.due_on) return;
    const task = await readTask(o.id);
    await sendQuietly(senderFor(req), task && taskEvent(task));
  });
}
