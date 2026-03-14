import FirecrawlApp from "@mendable/firecrawl-js";
import type { Document } from "@mendable/firecrawl-js";
import type { FirecrawlAuth, Post, SourceCandidate, SourceLink, XSearchResult } from "../../../types";
import type {
  WebSearchProviderRepository,
} from "../collectRepository";

const MAX_RESULTS_PER_QUERY = 3;

function toPost(item: Document | { url?: string; title?: string; snippet?: string }): Post | null {
  const asDoc = item as Document;
  const raw = item as { url?: string; title?: string; snippet?: string };
  const url = asDoc.metadata?.url ?? raw.url;
  if (!url) return null;

  const text =
    asDoc.markdown?.slice(0, 280) ??
    raw.snippet ??
    asDoc.metadata?.description ??
    raw.title;
  if (!text) return null;

  return { text, url };
}

function toCandidate(
  item: Document | { url?: string; title?: string; snippet?: string },
  context: string
): SourceCandidate | null {
  const asDoc = item as Document;
  const raw = item as { url?: string; title?: string; snippet?: string };
  const url = asDoc.metadata?.url ?? raw.url;
  if (!url) return null;

  return {
    url,
    title: asDoc.metadata?.title ?? raw.title,
    description: asDoc.metadata?.description ?? asDoc.markdown?.slice(0, 200) ?? raw.snippet,
    context,
  };
}

function toLink(
  item: Document | { url?: string; title?: string; snippet?: string }
): SourceLink | null {
  const asDoc = item as Document;
  const raw = item as { url?: string; title?: string; snippet?: string };
  const url = asDoc.metadata?.url ?? raw.url;
  if (!url) return null;

  return {
    url,
    title: asDoc.metadata?.title ?? raw.title,
    description: asDoc.metadata?.description ?? asDoc.markdown?.slice(0, 200) ?? raw.snippet,
  };
}

export function createFirecrawlSearchProvider(
  auth?: FirecrawlAuth
): WebSearchProviderRepository | null {
  const apiKey = auth?.apiKey;
  if (!apiKey) return null;

  const app = new FirecrawlApp({ apiKey });

  return {
    async searchPosts(queries, iteration): Promise<XSearchResult[]> {
      const results: XSearchResult[] = [];

      for (const query of queries) {
        try {
          const result = await app.search(query, {
            sources: ["web"],
            limit: MAX_RESULTS_PER_QUERY,
            tbs: iteration === 0 ? "qdr:m" : undefined,
          });

          results.push({
            query,
            posts: (result.web ?? [])
              .map((item) =>
                toPost(item as Document | { url?: string; title?: string; snippet?: string })
              )
              .filter((post): post is Post => post !== null),
          });
        } catch (err) {
          console.warn(`[firecrawlSearchProvider] search failed "${query}":`, err);
          results.push({ query, posts: [] });
        }
      }

      return results;
    },

    async searchCandidates(queries): Promise<SourceCandidate[]> {
      const candidates: SourceCandidate[] = [];

      for (const query of queries) {
        try {
          const result = await app.search(`${query} 公式 OR 発表 OR ソース`, {
            sources: ["web"],
            limit: MAX_RESULTS_PER_QUERY,
          });

          candidates.push(
            ...(result.web ?? [])
              .map((item) =>
                toCandidate(
                  item as Document | { url?: string; title?: string; snippet?: string },
                  query
                )
              )
              .filter((candidate): candidate is SourceCandidate => candidate !== null)
          );
        } catch (err) {
          console.warn(`[firecrawlSearchProvider] candidate search failed "${query}":`, err);
        }
      }

      return candidates;
    },

    async searchLinks(queries): Promise<SourceLink[]> {
      const links: SourceLink[] = [];
      const seen = new Set<string>();

      for (const query of queries) {
        try {
          const result = await app.search(query, {
            sources: ["web"],
            limit: MAX_RESULTS_PER_QUERY,
            tbs: "qdr:m",
          });

          for (const item of result.web ?? []) {
            const link = toLink(
              item as Document | { url?: string; title?: string; snippet?: string }
            );
            if (!link || seen.has(link.url)) continue;
            seen.add(link.url);
            links.push(link);
          }
        } catch (err) {
          console.warn(`[firecrawlSearchProvider] link search failed "${query}":`, err);
        }
      }

      return links;
    },
  };
}
