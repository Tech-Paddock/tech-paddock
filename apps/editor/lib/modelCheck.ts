import Anthropic from "@anthropic-ai/sdk";
import { getServiceClient } from "./supabase";

const PINNED_MODEL = "claude-sonnet-5";

// Runs on login (see app/api/login/route.ts) rather than a cron — this app
// has no scheduled-job infra yet, and login frequency is a fine cadence for
// a personal tool. Flags newly-appeared Sonnet-family model IDs for manual
// review; never swaps the pinned model itself, since a new model can carry
// API-shape changes (we hit exactly that with `effort` moving under
// `output_config`) that deserve a look before anything starts using them.
export async function runModelDriftCheck() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;

  const anthropic = new Anthropic({ apiKey });

  const sonnetIds: string[] = [];
  try {
    for await (const model of anthropic.models.list()) {
      if (model.id.includes("sonnet")) sonnetIds.push(model.id);
    }
  } catch {
    return;
  }

  const supabase = getServiceClient();
  const { data: existing } = await supabase
    .from("model_status")
    .select("known_sonnet_models")
    .eq("id", 1)
    .maybeSingle();

  const knownBefore: string[] = (existing?.known_sonnet_models as string[] | null) ?? [];
  const newlyDetected = sonnetIds.filter((id) => !knownBefore.includes(id));
  // Empty baseline (first run ever) just seeds it — nothing to flag yet.
  const drift = knownBefore.length > 0 && newlyDetected.length > 0;

  await supabase.from("model_status").upsert({
    id: 1,
    checked_at: new Date().toISOString(),
    pinned_model: PINNED_MODEL,
    known_sonnet_models: sonnetIds,
    newly_detected: drift ? newlyDetected : [],
    drift_detected: drift,
  });
}
