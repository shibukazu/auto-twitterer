import { buildAnalyzeStylePrompt } from "../../prompts/analyzeStylePrompt";
import { withRetry } from "../../utils/retry";
import { createAnthropicClient } from "../../utils/anthropic";
import type { AnthropicAuth, StyleAnalysis } from "../../types";

export async function analyzeStyle(
  styleInstruction: string,
  styleExamples: string[] = [],
  auth?: AnthropicAuth
): Promise<StyleAnalysis> {
  const client = createAnthropicClient(auth);
  const prompt = buildAnalyzeStylePrompt(styleInstruction, styleExamples);

  const message = await withRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    })
  );

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from style analysis");
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not parse style analysis JSON:\n${textBlock.text}`);
  }

  return JSON.parse(jsonMatch[0]) as StyleAnalysis;
}
