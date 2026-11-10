// The commit this deployment is serving (TEC-57). Public: the gate opens
// exactly GET /api/version (proxy.ts), so this answers with the commit and
// nothing else, and exports no other method. Stamped from
// packages/shared/app/api/version/route.ts into every gated app; change it
// there, not here.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
