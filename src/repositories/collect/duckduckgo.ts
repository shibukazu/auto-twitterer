import type { WebCollectRepository, WebSearchProviderRepository } from "./collectRepository";

export function createDuckDuckGo(
  provider: WebSearchProviderRepository | null
): WebCollectRepository | null {
  if (!provider) return null;

  return {
    method: "duckduckgo",
    searchPosts: provider.searchPosts,
    searchCandidates: provider.searchCandidates,
    searchLinks: provider.searchLinks,
  };
}
