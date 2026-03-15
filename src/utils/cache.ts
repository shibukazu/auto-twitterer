import { resolve } from "path";
import type {
  ActiveInformationCollectWorkflowInput,
  CollectedData,
  Draft,
  GenerateAndPublishWorkflowInput,
  SourceLink,
  StyleAnalysis,
} from "../types";

let _cacheKey = "default";
let _historyKey = "default";
let _styleKey = "default";

interface WorkflowCacheEntry {
  collected?: CollectedData;
  sources?: SourceLink[];
  drafts?: Draft[];
  postsDump?: unknown;
}

interface CacheDatabase {
  workflowCache: Record<string, WorkflowCacheEntry>;
  draftHistory: Record<string, string[]>;
  styleCache: Record<string, StyleAnalysis>;
}

const DB_PATH = resolve(process.cwd(), ".cache", "db.json");

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function computeCacheKey(input: unknown): string {
  return Bun.hash(stableStringify(input)).toString(16);
}

export function computeHistoryKey(
  input: ActiveInformationCollectWorkflowInput | GenerateAndPublishWorkflowInput
): string {
  return computeCacheKey(input.generation.instruction);
}

export function computeStyleKey(
  instructionOrInput: ActiveInformationCollectWorkflowInput | GenerateAndPublishWorkflowInput | string,
  examples?: string[]
): string {
  if (typeof instructionOrInput === "string") {
    return computeCacheKey({
      instruction: instructionOrInput,
      examples: examples ?? [],
    });
  }

  return computeStyleKey(
    instructionOrInput.styleEstimation.instruction,
    instructionOrInput.styleEstimation.examples ?? []
  );
}

export function setCacheKey(key: string): void {
  _cacheKey = key;
}

export function setHistoryKey(key: string): void {
  _historyKey = key;
}

export function setStyleKey(key: string): void {
  _styleKey = key;
}

async function ensureCacheDir(): Promise<void> {
  await Bun.$`mkdir -p ${resolve(process.cwd(), ".cache")}`.quiet();
}

async function loadDb(): Promise<CacheDatabase> {
  const file = Bun.file(DB_PATH);
  if (!(await file.exists())) {
    return {
      workflowCache: {},
      draftHistory: {},
      styleCache: {},
    };
  }

  try {
    const db = (await file.json()) as Partial<CacheDatabase>;
    return {
      workflowCache: db.workflowCache ?? {},
      draftHistory: db.draftHistory ?? {},
      styleCache: db.styleCache ?? {},
    };
  } catch {
    return {
      workflowCache: {},
      draftHistory: {},
      styleCache: {},
    };
  }
}

async function saveDb(db: CacheDatabase): Promise<void> {
  await ensureCacheDir();
  await Bun.write(DB_PATH, JSON.stringify(db, null, 2));
}

async function updateDb(mutator: (db: CacheDatabase) => void): Promise<void> {
  const db = await loadDb();
  mutator(db);
  await saveDb(db);
}

function getWorkflowEntry(db: CacheDatabase): WorkflowCacheEntry {
  return db.workflowCache[_cacheKey] ?? {};
}

export async function saveCollected(data: CollectedData): Promise<void> {
  await updateDb((db) => {
    const entry = getWorkflowEntry(db);
    entry.collected = data;
    db.workflowCache[_cacheKey] = entry;
  });
  console.info("cache.save.collected", {
    scope: "workflowCache",
    key: _cacheKey,
  });
}

export async function loadCollected(): Promise<CollectedData> {
  const db = await loadDb();
  const collected = db.workflowCache[_cacheKey]?.collected;
  if (!collected) {
    throw new Error(`.cache/db.json に workflowCache.${_cacheKey}.collected が見つかりません。`);
  }
  return collected;
}

export async function saveSources(data: SourceLink[]): Promise<void> {
  await updateDb((db) => {
    const entry = getWorkflowEntry(db);
    entry.sources = data;
    db.workflowCache[_cacheKey] = entry;
  });
  console.info("cache.save.sources", {
    scope: "workflowCache",
    key: _cacheKey,
    count: data.length,
  });
}

export async function loadSources(): Promise<SourceLink[]> {
  const db = await loadDb();
  const sources = db.workflowCache[_cacheKey]?.sources;
  if (!sources) {
    throw new Error(`.cache/db.json に workflowCache.${_cacheKey}.sources が見つかりません。`);
  }
  return sources;
}

export async function saveStyle(data: StyleAnalysis): Promise<void> {
  await updateDb((db) => {
    db.styleCache[_styleKey] = data;
  });
  console.info("cache.save.style", {
    scope: "styleCache",
    key: _styleKey,
  });
}

export async function loadStyle(): Promise<StyleAnalysis | null> {
  const db = await loadDb();
  return db.styleCache[_styleKey] ?? null;
}

export async function saveDrafts(data: Draft[]): Promise<void> {
  await updateDb((db) => {
    const entry = getWorkflowEntry(db);
    entry.drafts = data;
    db.workflowCache[_cacheKey] = entry;
  });
  console.info("cache.save.drafts", {
    scope: "workflowCache",
    key: _cacheKey,
    count: data.length,
  });
}

export async function loadDrafts(): Promise<Draft[]> {
  const db = await loadDb();
  const drafts = db.workflowCache[_cacheKey]?.drafts;
  if (!drafts) {
    throw new Error(`.cache/db.json に workflowCache.${_cacheKey}.drafts が見つかりません。`);
  }
  return drafts;
}

export async function loadDraftHistory(): Promise<string[]> {
  const db = await loadDb();
  return db.draftHistory[_historyKey] ?? [];
}

export async function appendDraftHistory(bodies: string[]): Promise<void> {
  let mergedCount = 0;
  await updateDb((db) => {
    const existing = db.draftHistory[_historyKey] ?? [];
    const merged = [...existing, ...bodies];
    db.draftHistory[_historyKey] = merged;
    mergedCount = merged.length;
  });
  console.info("cache.appendDraftHistory", {
    scope: "history",
    key: _historyKey,
    added: bodies.length,
    total: mergedCount,
  });
}

export async function dumpPosts(collected: CollectedData): Promise<void> {
  await ensureCacheDir();

  const accountPostsByMethod = Object.fromEntries(
    Object.entries(collected.accountPostsByMethod).map(([method, accounts]) => [
      method,
      (accounts ?? []).map(({ account, posts }) => ({
        account: `@${account}`,
        postCount: posts.length,
        posts: posts.map((post) => ({
          text: post.text,
          url: post.url,
          ...(post.timestamp ? { timestamp: post.timestamp } : {}),
        })),
      })),
    ])
  );

  const searchResultsByMethod = Object.fromEntries(
    Object.entries(collected.searchResultsByMethod).map(([method, results]) => [
      method,
      (results ?? []).map(({ query, posts }) => ({
        query,
        postCount: posts.length,
        posts: posts.map((post) => ({
          text: post.text,
          url: post.url,
          ...(post.timestamp ? { timestamp: post.timestamp } : {}),
        })),
      })),
    ])
  );

  const referenceAccountPostsTotal = Object.values(collected.accountPostsByMethod).reduce(
    (sum, accounts) =>
      sum + (accounts ?? []).reduce((accountSum, account) => accountSum + account.posts.length, 0),
    0
  );
  const searchResultPostsTotal = Object.values(collected.searchResultsByMethod).reduce(
    (sum, results) =>
      sum + (results ?? []).reduce((resultSum, result) => resultSum + result.posts.length, 0),
    0
  );
  const searchQueriesCount = Object.values(collected.searchResultsByMethod).reduce(
    (sum, results) => sum + (results ?? []).length,
    0
  );

  const dump = {
    generatedAt: new Date().toISOString(),
    methods: collected.methods,
    seedKeywordsByMethod: collected.seedKeywordsByMethod,
    seedUrlsByMethod: collected.seedUrlsByMethod,
    summary: {
      referenceAccountPostsTotal,
      searchResultPostsTotal,
      searchQueriesCount,
    },
    accountPostsByMethod,
    searchResultsByMethod,
  };

  await updateDb((db) => {
    const entry = getWorkflowEntry(db);
    entry.postsDump = dump;
    db.workflowCache[_cacheKey] = entry;
  });
  console.info("cache.dump.posts", {
    scope: "workflowCache",
    key: _cacheKey,
    summary: {
      referenceAccountPostsTotal,
      searchResultPostsTotal,
      searchQueriesCount,
    },
  });
}
