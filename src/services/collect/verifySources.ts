import { buildVerifySourcesPrompt } from "../../prompts/verifySourcesPrompt";
import { withRetry } from "../../utils/retry";
import { createAnthropicClient } from "../../utils/anthropic";
import type { AnthropicAuth, SourceCandidate, SourceLink } from "../../types";

export async function verifySources(
  candidates: SourceCandidate[],
  instruction: string,
  auth?: AnthropicAuth
): Promise<SourceLink[]> {
  if (candidates.length === 0) return [];
  const client = createAnthropicClient(auth);

  const prompt = buildVerifySourcesPrompt(candidates, instruction);

  const message = await withRetry(() =>
    client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    })
  );

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from source verification");
  }

  const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn("verifySources json not found");
    return [];
  }

  const verified = JSON.parse(jsonMatch[0]) as {
    index: number;
    url: string;
    title?: string;
    description?: string;
  }[];

  return verified.map(({ url, title, description }) => ({ url, title, description }));
}
