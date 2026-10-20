import { NextResponse } from "next/server";
import { UpstreamError, errorBody } from "./errors";

/**
 * Every route's catch block: an error, as the status it means (`lib/errors.ts`).
 * Kept apart from `errors.ts` so the lib files that throw never import Next.
 * A stored sign-in that failed adds `reconnect: true`, so the list tab offers
 * Connect again rather than Try again.
 */
export function errorResponse(e: unknown, fallback: string): NextResponse {
  const { status, error } = errorBody(e, fallback);
  const reconnect = e instanceof UpstreamError && e.reconnect;
  return NextResponse.json(reconnect ? { error, reconnect } : { error }, { status });
}
