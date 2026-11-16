import { handleWrite } from "@/lib/api";
import { writeTask } from "@/lib/db";
import { parseTask } from "@/lib/validate";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleWrite(request, parseTask, (o) => writeTask(o));
}
