import type { NextRequest } from "next/server";
import { handleLogin } from "@/lib/login";
import { runModelDriftCheck } from "@/lib/modelCheck";

// The shared login handler (packages/shared/lib/login.ts), plus the editor's
// one addition: a successful login is also when the model drift check runs.
// lib/modelCheck.ts says why login is the cadence. It never blocks a login:
// a failed check is swallowed, as it always was.
export async function POST(request: NextRequest) {
  const res = await handleLogin(request);
  if (res.ok) await runModelDriftCheck().catch(() => {});
  return res;
}
