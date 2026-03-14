import type {
  AccountCollectMethod,
  CollectAuth,
  FirecrawlAuth,
  WebCollectMethod,
} from "../../types";
import { createBird } from "./bird";
import type { AccountCollectRepository, WebCollectRepository } from "./collectRepository";
import { createDuckDuckGo } from "./duckduckgo";
import { createFirecrawl } from "./firecrawl";
import { createFirecrawlSearchProvider } from "./firecrawl/searchProvider";
import { createXApi } from "./xApi";

export function createCollectRepository(
  method: AccountCollectMethod,
  auth: CollectAuth
): AccountCollectRepository {
  return method === "bird"
    ? createBird(auth.bird)
    : createXApi(auth.xapi);
}

export function createWebCollectRepository(
  method: WebCollectMethod,
  auth?: FirecrawlAuth
): WebCollectRepository | null {
  if (method === "firecrawl") {
    return createFirecrawl(auth);
  }

  return createDuckDuckGo(createFirecrawlSearchProvider(auth));
}
