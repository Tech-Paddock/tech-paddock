import { getServiceClient } from "@/lib/supabase";
import { draftMessage } from "@/lib/anthropic";

export const SEED_STYLE_GUIDE = `- Declarative language, not hedged phrasing
- One ask per message, never stacked
- No em dashes
- No "skill set" language
- Warm contacts get texts; cold professional contacts get a LinkedIn DM; email only when a direct address exists
- Odd-time scheduled sends read more human than round numbers`;

// Folds new writing samples into the existing style guide via Claude, then
// stores the result as the next version. Shared by the bulk upload endpoint
// (/api/style-guide) and single-message commits (/api/commit).
export async function refineStyleGuide(samples: string) {
  const supabase = getServiceClient();
  const { data: current } = await supabase
    .from("style_guide")
    .select("*")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentContent = current?.content ?? SEED_STYLE_GUIDE;

  const refined = await draftMessage({
    effort: "high",
    systemPrompt:
      "You maintain a style guide for someone's outreach messages (text, email, LinkedIn, Slack). " +
      "You will be given the current style guide as a bulleted list of rules, and new " +
      "writing sample(s) in their voice, each tagged with its medium and purpose. Update the rules " +
      "to reflect any consistent patterns visible in the new samples: word choice, sentence length, " +
      "tone, structure — and how those vary by medium or purpose if a pattern is specific to one. " +
      "Keep rules that still hold. Output ONLY the updated bulleted list of rules, nothing else.",
    userPrompt: `Current style guide:\n${currentContent}\n\nNew writing sample(s):\n${samples}`,
  });

  const nextVersion = (current?.version ?? 0) + 1;

  const { data, error } = await supabase
    .from("style_guide")
    .insert({ version: nextVersion, content: refined.trim() })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
