import { NextResponse } from "next/server";
import { errorBody } from "./errors";

/**
 * Every route's catch block: an error, as the status it means (`lib/errors.ts`).
 * Kept apart from `errors.ts` so the lib files that throw never import Next.
 */
export function errorResponse(e: unknown, fallback: string): NextResponse {
  const { status, error } = errorBody(e, fallback);
  return NextResponse.json({ error }, { status });
}
