import type { WebCollectMethod } from "../../types";
import type { WebCollectRepository } from "../../repositories/collect/collectRepository";
import type { CollectedData, SourceCandidate } from "../../types";

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s"'<>)]+/g;
  return Array.from(new Set(text.match(urlRegex) ?? []));
}

export async function collectSourceCandidates(
  collected: CollectedData,
  repositories: Partial<Record<WebCollectMethod, WebCollectRepository | null>>
): Promise<SourceCandidate[]> {
  const candidates: SourceCandidate[] = [];
  const queriesWithoutUrlsByMethod: Partial<Record<WebCollectMethod, string[]>> = {};

  for (const [method, urls] of Object.entries(collected.seedUrlsByMethod) as Array<
    [WebCollectMethod, string[] | undefined]
  >) {
    for (const url of urls ?? []) {
      candidates.push({ url, context: `workflow-input:${method}` });
    }
  }

  for (const accounts of Object.values(collected.accountPostsByMethod)) {
    for (const { posts } of accounts ?? []) {
      for (const post of posts) {
        for (const url of extractUrls(post.text)) {
          candidates.push({ url, context: post.text });
        }
      }
    }
  }

  for (const [method, results] of Object.entries(collected.searchResultsByMethod)) {
    const typedMethod = method as WebCollectMethod;
    const queriesWithoutUrls = [...(collected.seedKeywordsByMethod[typedMethod] ?? [])];

    for (const { query, posts } of results ?? []) {
      let foundUrls = false;

      for (const post of posts) {
        const textUrls = extractUrls(post.text);
        for (const url of textUrls) {
          candidates.push({ url, context: post.text });
          foundUrls = true;
        }
        candidates.push({ url: post.url, context: post.text });
        foundUrls = true;
      }

      if (!foundUrls) {
        queriesWithoutUrls.push(query);
      }
    }

    if (typedMethod === "firecrawl" || typedMethod === "duckduckgo") {
      queriesWithoutUrlsByMethod[typedMethod] = queriesWithoutUrls;
    }
  }

  for (const [method, queriesWithoutUrls] of Object.entries(queriesWithoutUrlsByMethod) as Array<
    [WebCollectMethod, string[] | undefined]
  >) {
    if (!queriesWithoutUrls || queriesWithoutUrls.length === 0) continue;
    console.log(`    ${method} 補完: ${queriesWithoutUrls.join(", ")}`);
    const repository = repositories[method];
    if (repository) {
      const searched = await repository.searchCandidates(queriesWithoutUrls);
      candidates.push(...searched);
    }
  }

  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (!c.url || seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}
