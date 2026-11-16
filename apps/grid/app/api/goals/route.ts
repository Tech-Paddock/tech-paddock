import { handleWrite } from "@/lib/api";
import { writeGoal } from "@/lib/db";
import { parseGoal } from "@/lib/validate";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleWrite(request, parseGoal, (o) => writeGoal(o));
}
