import { handleWrite } from "@/lib/api";
import { writeMeditation } from "@/lib/db";
import { parseMeditation } from "@/lib/validate";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleWrite(request, parseMeditation, (o) => writeMeditation(o));
}
