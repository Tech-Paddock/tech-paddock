import { handleWrite } from "@/lib/api";
import { writeCompletion } from "@/lib/db";
import { parseCompletion } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** POST only, and an insert only: a completion is never rewritten or deleted (RULES.md, Never 1). */
export function POST(request: Request) {
  return handleWrite(request, parseCompletion, (o) => writeCompletion(o));
}
