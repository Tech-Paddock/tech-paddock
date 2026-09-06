import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-5";

export type Effort = "low" | "medium" | "high";

let client: Anthropic | null = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY must be set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function draftMessage(params: {
  systemPrompt: string;
  userPrompt: string;
  effort: Effort;
}) {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: params.systemPrompt,
    messages: [{ role: "user", content: params.userPrompt }],
    // Thinking is adaptive/default on this model. `effort` steers response
    // depth without a separate extended-thinking toggle.
    // @ts-expect-error -- effort is a supported request field on claude-sonnet-5
    effort: params.effort,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "";
}
