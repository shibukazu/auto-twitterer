import type { FirecrawlAuth } from "../../types";
import type { WebCollectRepository } from "./collectRepository";
import { createFirecrawlSearchProvider } from "./firecrawl/searchProvider";

export function createFirecrawl(auth?: FirecrawlAuth): WebCollectRepository | null {
  const provider = createFirecrawlSearchProvider(auth);
  if (!provider) return null;

  return {
    method: "firecrawl",
    searchPosts: provider.searchPosts,
    searchCandidates: provider.searchCandidates,
    searchLinks: provider.searchLinks,
  };
}
