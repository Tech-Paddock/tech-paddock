import { handleWrite } from "@/lib/api";
import { writePerson } from "@/lib/db";
import { parsePerson } from "@/lib/validate";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleWrite(request, parsePerson, (o) => writePerson(o));
}
