import { handleWrite } from "@/lib/api";
import { writeRoutine } from "@/lib/db";
import { parseRoutine } from "@/lib/validate";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleWrite(request, parseRoutine, (o) => writeRoutine(o));
}
