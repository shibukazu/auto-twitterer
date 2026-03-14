import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicAuth } from "../types";

export function createAnthropicClient(auth?: AnthropicAuth): Anthropic {
  const apiKey = auth?.apiKey;
  if (!apiKey) {
    throw new Error(
      "Anthropic API key が不足しています。\n" +
        "WorkflowInput.auth.anthropic.apiKey を設定してください。"
    );
  }
  return new Anthropic({ apiKey });
}
