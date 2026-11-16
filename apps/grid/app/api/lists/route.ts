import { handleWrite } from "@/lib/api";
import { writeList } from "@/lib/db";
import { parseList } from "@/lib/validate";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleWrite(request, parseList, (o) => writeList(o));
}
