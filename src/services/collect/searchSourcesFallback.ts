import { buildSourceKeywordsPrompt } from "../../prompts/sourceKeywordsPrompt";
import type { WebCollectRepository } from "../../repositories/collect/collectRepository";
import { createAnthropicClient } from "../../utils/anthropic";
import { withRetry } from "../../utils/retry";
import type { AnthropicAuth, CollectedData, SourceLink, WebCollectMethod } from "../../types";

async function decideKeywords(
  instruction: string,
  collected: CollectedData,
  auth?: AnthropicAuth
): Promise<string[]> {
  const llm = createAnthropicClient(auth);
  const prompt = buildSourceKeywordsPrompt(instruction, collected);

  const message = await withRetry(() =>
    llm.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    })
  );

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const keywords = JSON.parse(jsonMatch[0]) as string[];
  return Array.isArray(keywords) ? keywords : [];
}

export async function searchSourcesFallback(
  instruction: string,
  collected: CollectedData,
  repositories: Partial<Record<WebCollectMethod, WebCollectRepository | null>>,
  auth?: AnthropicAuth
): Promise<SourceLink[]> {
  const seedSources = Object.values(collected.seedUrlsByMethod)
    .flatMap((urls) => urls ?? [])
    .map((url) => ({ url }));
  const availableMethods = Object.entries(repositories).filter(([, repository]) => !!repository) as Array<
    [WebCollectMethod, WebCollectRepository]
  >;
  if (availableMethods.length === 0) return seedSources;

  console.info("fallback keyword generation start");
  const autoKeywords = await decideKeywords(instruction, collected, auth);
  const seedKeywords = Object.values(collected.seedKeywordsByMethod).flatMap((keywords) => keywords ?? []);
  const keywords = [...seedKeywords, ...autoKeywords];

  if (keywords.length === 0) {
    console.warn("fallback no keywords");
    return seedSources;
  }

  console.info("fallback search keywords", { count: keywords.length });
  const sourceGroups = await Promise.all(
    availableMethods.map(async ([method, repository]) => {
      const sources = await repository.searchLinks(keywords);
      console.info("fallback search links result", { method, count: sources.length });
      return sources;
    })
  );

  const merged = [...seedSources, ...sourceGroups.flat()];
  const seen = new Set<string>();
  return merged.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}
