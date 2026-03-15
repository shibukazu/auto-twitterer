import { getCollectMethods, getCollectionInstruction } from "../../config";
import { buildCollectDecidePrompt } from "../../prompts/collectDecidePrompt";
import {
  createCollectRepository,
  createWebCollectRepository,
} from "../../repositories/collect/factory";
import type {
  AccountCollectMethod,
  AccountPosts,
  ActiveCollectMethod,
  AnthropicAuth,
  CollectedData,
  CollectDecision,
  SourceLink,
  ActiveInformationCollectWorkflowInput,
  WebCollectMethod,
  XSearchResult,
} from "../../types";
import { createAnthropicClient } from "../../utils/anthropic";
import { withRetry } from "../../utils/retry";
import { sleep } from "../../utils/sleep";
import { collectSourceCandidates } from "./collectSources";
import { searchSourcesFallback } from "./searchSourcesFallback";
import { verifySources } from "./verifySources";

const SLEEP_BETWEEN_ITERATIONS_BASE = 4000;
const SLEEP_BETWEEN_ITERATIONS_JITTER = 2000;

type AccountCollectResult = {
  kind: "account";
  method: AccountCollectMethod;
  accountPosts: AccountPosts[];
  searchResults: XSearchResult[];
};

type WebCollectResult = {
  kind: "web";
  method: WebCollectMethod;
  searchResults: XSearchResult[];
};

function isAccountMethod(method: ActiveCollectMethod): method is AccountCollectMethod {
  return method === "xapi" || method === "bird";
}

function isWebMethod(method: ActiveCollectMethod): method is WebCollectMethod {
  return method === "firecrawl" || method === "duckduckgo";
}

function createEmptyCollected(methods: ActiveCollectMethod[]): CollectedData {
  return {
    methods,
    accountPostsByMethod: {},
    searchResultsByMethod: {},
    seedKeywordsByMethod: {},
    seedUrlsByMethod: {},
  };
}

function mergeAccountPosts(existing: AccountPosts[] = [], incoming: AccountPosts[]): AccountPosts[] {
  const byAccount = new Map<string, AccountPosts>();

  for (const item of existing) {
    byAccount.set(item.account, { account: item.account, posts: [...item.posts] });
  }

  for (const item of incoming) {
    const current = byAccount.get(item.account);
    if (!current) {
      byAccount.set(item.account, { account: item.account, posts: [...item.posts] });
      continue;
    }

    const seen = new Set(current.posts.map((post) => post.url));
    for (const post of item.posts) {
      if (seen.has(post.url)) continue;
      seen.add(post.url);
      current.posts.push(post);
    }
  }

  return Array.from(byAccount.values());
}

function getWebSeedQueries(input: ActiveInformationCollectWorkflowInput, method: WebCollectMethod): string[] {
  const config = input.collecting.active?.[method];
  if (!config) return [];
  if (config.keywords === "auto") {
    return [getCollectionInstruction(input)];
  }
  return config.keywords;
}

function getWebSeedUrls(input: ActiveInformationCollectWorkflowInput, method: WebCollectMethod): string[] {
  return input.collecting.active?.[method]?.urls ?? [];
}

function getMethodMaxIterations(
  input: ActiveInformationCollectWorkflowInput,
  method: ActiveCollectMethod
): number {
  return input.collecting.active?.[method]?.max_iterations ?? 0;
}

async function decide(
  instruction: string,
  collected: CollectedData,
  remainingIterations: number,
  auth?: AnthropicAuth
): Promise<CollectDecision> {
  const client = createAnthropicClient(auth);
  const prompt = buildCollectDecidePrompt(instruction, collected, remainingIterations);

  const message = await withRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    })
  );

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from collect decision");
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not parse collect decision JSON:\n${textBlock.text}`);
  }

  return JSON.parse(jsonMatch[0]) as CollectDecision;
}

export async function collectAndVerifySources(input: ActiveInformationCollectWorkflowInput): Promise<{
  collected: CollectedData;
  sources: SourceLink[];
}> {
  const instruction = getCollectionInstruction(input);
  const activeMethods = getCollectMethods(input) as ActiveCollectMethod[];
  const collected = createEmptyCollected(activeMethods);

  if (activeMethods.length === 0) {
    return { collected, sources: [] };
  }

  const webRepositories: Partial<Record<WebCollectMethod, ReturnType<typeof createWebCollectRepository>>> = {};
  for (const method of activeMethods) {
    if (!isWebMethod(method)) continue;
    webRepositories[method] = createWebCollectRepository(method, input.auth.firecrawl);
    if (!webRepositories[method]) {
      throw new Error(
      `${method} を collecting.active.methods に指定したため Firecrawl の認証情報が必要です。\n` +
        "WorkflowInput.auth.firecrawl.apiKey を設定してください。"
      );
    }
    collected.seedKeywordsByMethod[method] = getWebSeedQueries(input, method);
    collected.seedUrlsByMethod[method] = getWebSeedUrls(input, method);
  }

  const globalMaxIterations = Math.max(
    ...activeMethods.map((method) => getMethodMaxIterations(input, method)),
    0
  );
  let nextSearchQueries: string[] | undefined;

  for (let iteration = 0; iteration < globalMaxIterations; iteration++) {
    const runnableMethods = activeMethods.filter(
      (method) => iteration < getMethodMaxIterations(input, method)
    );
    if (runnableMethods.length === 0) break;

    console.log(
      `    [collect loop ${iteration + 1}/${globalMaxIterations}] methods: ${runnableMethods.join(", ")}`
    );

    const tasks = runnableMethods.map(async (method): Promise<AccountCollectResult | WebCollectResult> => {
      if (isAccountMethod(method)) {
        const config = input.collecting.active?.[method];
        if (!config) {
          throw new Error(`workflowInput.collecting.active.${method} を設定してください。`);
        }
        const repository = createCollectRepository(method, {
          bird: input.auth.bird,
          xapi: input.auth.xapi,
        });
        console.log(
          `    ${method}: 参照アカウント投稿を取得中 (${iteration + 1}/${config.max_iterations})`
        );
        const accountPosts = await repository.fetchAccountPosts(config.target_accounts, iteration);
        const searchQueries = iteration === 0 ? [] : (nextSearchQueries ?? []);
        const searchResults =
          searchQueries.length > 0
            ? await repository.searchPosts(searchQueries, iteration)
            : [];
        return { kind: "account", method, accountPosts, searchResults };
      }

      const repository = webRepositories[method];
      const queries = iteration === 0 ? getWebSeedQueries(input, method) : (nextSearchQueries ?? []);
      if (!repository || queries.length === 0) {
        return { kind: "web", method, searchResults: [] as XSearchResult[] };
      }

      console.log(
        `    ${method}: Web検索を実行 (${iteration + 1}/${getMethodMaxIterations(input, method)})`
      );
      const searchResults = await repository.searchPosts(queries, iteration);
      return { kind: "web", method, searchResults };
    });

    const results = await Promise.all(tasks);

    for (const result of results) {
      if (result.kind === "account") {
        collected.accountPostsByMethod[result.method] = mergeAccountPosts(
          collected.accountPostsByMethod[result.method],
          result.accountPosts
        );
        const currentSearchResults = collected.searchResultsByMethod[result.method] ?? [];
        collected.searchResultsByMethod[result.method] = [
          ...currentSearchResults,
          ...result.searchResults,
        ];
      } else {
        const current = collected.searchResultsByMethod[result.method] ?? [];
        collected.searchResultsByMethod[result.method] = [...current, ...result.searchResults];
      }
    }

    const remainingIterations = Math.max(
      ...activeMethods.map((method) => getMethodMaxIterations(input, method) - (iteration + 1)),
      0
    );

    console.log("    収集結果の十分性を判定中...");
    const decision = await decide(instruction, collected, remainingIterations, input.auth.anthropic);
    console.log(`    判断: ${decision.sufficient ? "十分" : "不十分"} — ${decision.reason ?? ""}`);

    if (decision.sufficient || remainingIterations === 0) {
      break;
    }

    nextSearchQueries = decision.searchQueries?.filter((query) => query.trim().length > 0);
    if (!nextSearchQueries || nextSearchQueries.length === 0) {
      console.warn("    次ループ用の検索クエリが返されませんでした。ここで終了します。");
      break;
    }

    console.log(`    次ループ検索クエリ: ${nextSearchQueries.join(" / ")}`);
    await sleep(SLEEP_BETWEEN_ITERATIONS_BASE, SLEEP_BETWEEN_ITERATIONS_JITTER);
  }

  const candidates = await collectSourceCandidates(collected, webRepositories);
  let sources = await verifySources(candidates, instruction, input.auth.anthropic);
  if (sources.length === 0) {
    sources = await searchSourcesFallback(
      instruction,
      collected,
      webRepositories,
      input.auth.anthropic
    );
  }

  return { collected, sources };
}
