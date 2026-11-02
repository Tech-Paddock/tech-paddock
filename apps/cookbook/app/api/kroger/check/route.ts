import { NextResponse } from "next/server";
import { withAccessToken } from "@/lib/krogerConnection";
import { checkConnection } from "@/lib/krogerCheck";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * **The live King Soopers check** (TEC-211). Signed in only, like every route
 * under `/api` (`proxy.ts` is unchanged: no new signed-out path). It borrows the
 * account's access token through `withAccessToken`, so the page runs it in
 * `serial` with every other call that does, and answers one of five states
 * (`lib/krogerCheck.ts`). **Never a token**: `tests/kroger.test.ts` reads the
 * body for both. GET, because it changes nothing the user can see; a rotated
 * refresh token is resealed as it is on any other call.
 */
export async function GET() {
  try {
    return NextResponse.json(await checkConnection(() => withAccessToken(async () => true)));
  } catch (e) {
    return errorResponse(e, "Couldn't check King Soopers.");
  }
}
