import type {
  AccountCollectConfig,
  ActiveCollectMethod,
  AnthropicAuth,
  AuthConfig,
  AuthInputSource,
  BirdAuth,
  CollectingConfig,
  CollectedData,
  FirecrawlAuth,
  GenerateAndPublishWorkflowInput,
  PassiveInformationCollectWorkflowInput,
  PassiveInformationSignalPayload,
  StyleEstimationConfig,
  WebCollectConfig,
  ActiveInformationCollectWorkflowInput,
  XApiAuth,
  SourceLink,
  PostingConfig,
  SlackAuth,
  StartStep,
} from "./types";

const COLLECTION_METHODS = ["xapi", "bird", "firecrawl", "duckduckgo"] as const;
const WORKFLOW_START_STEPS = ["collect", "style", "generate", "post"] as const;

interface AccountCollectInputSource {
  /** 対象アカウント一覧 */
  target_accounts?: string[];
  /** メソッドごとの最大収集反復回数 */
  max_iterations?: number;
}

interface WebCollectInputSource {
  /** 検索キーワード（文字列配列 or "auto"） */
  keywords?: string[] | "auto";
  /** 追加検索 seed URL */
  urls?: string[];
  /** メソッドごとの最大収集反復回数 */
  max_iterations?: number;
}

interface ActiveCollectingInputSource {
  /** 収集で使うアクティブメソッド */
  methods?: ActiveCollectMethod[];
  /** xapi の収集設定 */
  xapi?: AccountCollectInputSource;
  /** bird の収集設定 */
  bird?: AccountCollectInputSource;
  /** firecrawl の検索設定 */
  firecrawl?: WebCollectInputSource;
  /** duckduckgo の検索設定 */
  duckduckgo?: WebCollectInputSource;
}

interface PassiveCollectingInputSource {
  /** 現在は "rss" 固定 */
  source_type?: "rss";
  /** 受信データを変換する transformer ファイル名 */
  transformer?: string;
  /** continueAsNew を行う閾値 */
  continue_as_new_after_items?: number;
}

interface CollectionInputSource {
  /** 収集判定・次検索キーワード生成のための指示文 */
  instruction?: string;
  /** アクティブ収集設定 */
  active?: ActiveCollectingInputSource;
  /** パッシブ収集設定 */
  passive?: PassiveCollectingInputSource;
}

interface GenerationInputSource {
  /** 投稿本文の生成指示 */
  instruction?: string;
  /** ハッシュタグを自動生成するか */
  generate_hashtags?: boolean;
  /** スレッド時に「詳細はスレッドへ」を付与するか */
  append_thread_notice?: boolean;
  /** 投稿本文にソースURLを含めず返信として添えるか */
  reply_source_url?: boolean;
}

interface StyleEstimationInputSource {
  /** スタイル推定指示 */
  instruction?: string;
  /** スタイル例文 */
  examples?: string[];
}

interface PostingInputSource {
  /** 投稿時間を揺らす分解能（分） */
  jitter_minutes?: number;
}

interface InputSource {
  /** 収集設定 */
  collecting?: CollectionInputSource;
  /** 生成設定 */
  generation?: GenerationInputSource;
  /** スタイル推定設定 */
  styleEstimation?: StyleEstimationInputSource;
  /** 投稿制御設定 */
  posting?: PostingInputSource;
  /** ドライランフラグ */
  dry_run?: boolean;
  /** 認証情報 */
  auth?: AuthInputSource;
  /** 再開用デバッグ情報 */
  debug?: {
    from_step?: StartStep;
  };
  /** 再開時に使う収集結果 */
  collected?: CollectedData;
  /** 再開時に使う検証済みソース */
  sources?: SourceLink[];
  /** passive ワークフローの継続状態 */
  runtime?: {
    /** 既処理シグナル ID */
    processed_item_ids?: string[];
    /** 未処理シグナル */
    pending_signals?: PassiveInformationSignalPayload[];
  };
}

type GenerateAndPublishInputSource = InputSource;
type PassiveInformationCollectInputSource = InputSource;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function parseString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function parseBoolean(value: unknown, label: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function parseStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((item, index) => parseString(item, `${label}[${index}]`));
}

function parseMaxIterations(value: unknown, label: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return n;
}

function parseNonNegativeInteger(value: unknown, label: string, fallback: number): number {
  if (value === undefined) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return n;
}

function parseCollectMethod(value: unknown, label: string): ActiveCollectMethod {
  if (typeof value !== "string" || !COLLECTION_METHODS.includes(value as ActiveCollectMethod)) {
    throw new Error(`${label} must be one of: ${COLLECTION_METHODS.join(", ")}`);
  }
  return value as ActiveCollectMethod;
}

function parseCollectMethods(value: unknown, label: string): ActiveCollectMethod[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  const methods = value.map((item, index) => parseCollectMethod(item, `${label}[${index}]`));
  return Array.from(new Set(methods));
}

function parseGeneration(
  source: GenerationInputSource | undefined,
  path: string
): ActiveInformationCollectWorkflowInput["generation"] {
  const record = source ? parseRecord(source, `${path}`) : {};
  return {
    instruction: parseString(record.instruction, `${path}.instruction`),
    generate_hashtags: parseBoolean(record.generate_hashtags, `${path}.generate_hashtags`, false),
    append_thread_notice: parseBoolean(record.append_thread_notice, `${path}.append_thread_notice`, false),
    reply_source_url: parseBoolean(record.reply_source_url, `${path}.reply_source_url`, false),
  };
}

function parseAccountCollectConfig(source: unknown, path: string): AccountCollectConfig {
  const record = parseRecord(source, path);
  return {
    target_accounts: parseStringArray(record.target_accounts, `${path}.target_accounts`),
    max_iterations: parseMaxIterations(record.max_iterations, `${path}.max_iterations`),
  };
}

function parseKeywords(value: unknown, label: string): string[] | "auto" {
  if (value === "auto") return "auto";
  return parseStringArray(value, label);
}

function parseWebCollectConfig(source: unknown, path: string): WebCollectConfig {
  const record = parseRecord(source, path);
  return {
    keywords: parseKeywords(record.keywords, `${path}.keywords`),
    urls: parseStringArray(record.urls, `${path}.urls`),
    max_iterations: parseMaxIterations(record.max_iterations, `${path}.max_iterations`),
  };
}

function parsePassiveCollectionConfig(
  source: unknown,
  path: string
): NonNullable<CollectingConfig["passive"]> {
  const record = parseRecord(source, path);
  const sourceType = record.source_type === undefined ? "rss" : parseString(record.source_type, `${path}.source_type`);

  return {
    source_type: sourceType as "rss",
    transformer: parseString(record.transformer, `${path}.transformer`),
    continue_as_new_after_items: parseNonNegativeInteger(
      record.continue_as_new_after_items,
      `${path}.continue_as_new_after_items`,
      100
    ),
  };
}

function parseActiveCollectingConfig(source: unknown, path: string): CollectingConfig["active"] {
  const record = source === undefined ? {} : parseRecord(source, path);
  const methods = parseCollectMethods(record.methods, `${path}.methods`);
  const active: CollectingConfig["active"] = { methods };

  for (const method of methods) {
    if (method === "xapi" || method === "bird") {
      active[method] = parseAccountCollectConfig(record[method], `${path}.${method}`);
      continue;
    }
    active[method] = parseWebCollectConfig(record[method], `${path}.${method}`);
  }

  return active;
}

function parseCollection(
  source: CollectionInputSource | undefined,
  path: string
): CollectingConfig {
  const record = parseRecord(source, path);
  const active = parseActiveCollectingConfig(record.active, `${path}.active`);
  const collectionInstruction =
    active.methods.length === 0
      ? record.instruction === undefined
        ? ""
        : parseOptionalString(record.instruction, `${path}.instruction`) ?? ""
      : parseString(record.instruction, `${path}.instruction`);
  const collection: CollectingConfig = {
    instruction: collectionInstruction,
    active,
  };

  if (record.passive !== undefined) {
    collection.passive = parsePassiveCollectionConfig(record.passive, `${path}.passive`);
  }

  return collection;
}

function parseStyle(source: unknown, path: string): StyleEstimationConfig {
  const record = parseRecord(source, path);
  return {
    instruction: parseString(record.instruction, `${path}.instruction`),
    examples:
      record.examples === undefined ? [] : parseStringArray(record.examples, `${path}.examples`),
  };
}

function parsePosting(source: unknown, path: string): PostingConfig {
  const record = source === undefined ? {} : parseRecord(source, path);
  const jitter_minutes = parseNonNegativeInteger(record.jitter_minutes, `${path}.jitter_minutes`, 0);
  return { jitter_minutes };
}

function parseOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (value === "") return undefined;
  return parseString(value, label);
}

function parseOptionalAuthString(value: unknown, label: string): string | undefined {
  return parseOptionalString(value, label);
}

function parseStartStep(value: unknown, label: string): StartStep {
  if (typeof value !== "string" || !WORKFLOW_START_STEPS.includes(value as StartStep)) {
    throw new Error(`${label} must be one of: ${WORKFLOW_START_STEPS.join(", ")}`);
  }
  return value as StartStep;
}

function parseBirdAuth(source: unknown, path: string): BirdAuth | undefined {
  if (source === undefined) return undefined;
  const record = parseRecord(source, path);
  const authToken = parseOptionalAuthString(record.authToken, `${path}.authToken`);
  const ct0 = parseOptionalAuthString(record.ct0, `${path}.ct0`);
  if (authToken === undefined && ct0 === undefined) return undefined;
  if (authToken === undefined || ct0 === undefined) {
    throw new Error(`${path} の設定が不完全です。authToken と ct0 の両方が必要です。`);
  }

  return {
    authToken,
    ct0,
  };
}

function parseXApiAuth(source: unknown, path: string): XApiAuth | undefined {
  if (source === undefined) return undefined;
  const record = parseRecord(source, path);
  const apiKey = parseOptionalAuthString(record.apiKey, `${path}.apiKey`);
  const apiSecret = parseOptionalAuthString(record.apiSecret, `${path}.apiSecret`);
  const accessToken = parseOptionalAuthString(record.accessToken, `${path}.accessToken`);
  const accessSecret = parseOptionalAuthString(record.accessSecret, `${path}.accessSecret`);
  if (
    apiKey === undefined &&
    apiSecret === undefined &&
    accessToken === undefined &&
    accessSecret === undefined
  ) {
    return undefined;
  }
  if (
    apiKey === undefined ||
    apiSecret === undefined ||
    accessToken === undefined ||
    accessSecret === undefined
  ) {
    throw new Error(
      `${path} の設定が不完全です。apiKey / apiSecret / accessToken / accessSecret の全てが必要です。`
    );
  }

  return {
    apiKey,
    apiSecret,
    accessToken,
    accessSecret,
  };
}

function parseFirecrawlAuth(source: unknown, path: string): FirecrawlAuth | undefined {
  if (source === undefined) return undefined;
  const record = parseRecord(source, path);
  const apiKey = parseOptionalAuthString(record.apiKey, `${path}.apiKey`);
  if (apiKey === undefined) return undefined;
  return { apiKey };
}

function parseAnthropicAuth(source: unknown, path: string): AnthropicAuth | undefined {
  if (source === undefined) return undefined;
  const record = parseRecord(source, path);
  const apiKey = parseOptionalAuthString(record.apiKey, `${path}.apiKey`);
  if (apiKey === undefined) return undefined;
  return { apiKey };
}

function parseSlackAuth(source: unknown, path: string): SlackAuth | undefined {
  if (source === undefined) return undefined;
  const record = parseRecord(source, path);
  const webhookUrl = parseOptionalAuthString(record.webhookUrl, `${path}.webhookUrl`);
  const mentionId = parseOptionalAuthString(record.mentionId, `${path}.mentionId`);
  if (webhookUrl === undefined && mentionId === undefined) return undefined;
  if (webhookUrl === undefined || mentionId === undefined) {
    throw new Error(`${path} の設定が不完全です。webhookUrl と mentionId の両方が必要です。`);
  }

  return { webhookUrl, mentionId };
}

function parseAuth(source: unknown, path: string): AuthConfig {
  const record = source === undefined ? {} : parseRecord(source, path);
  return {
    bird: parseBirdAuth(record.bird, `${path}.bird`),
    xapi: parseXApiAuth(record.xapi, `${path}.xapi`),
    firecrawl: parseFirecrawlAuth(record.firecrawl, `${path}.firecrawl`),
    anthropic: parseAnthropicAuth(record.anthropic, `${path}.anthropic`),
    slack: parseSlackAuth(record.slack, `${path}.slack`),
  };
}

function parseDebug(
  source: unknown,
  path: string
): { from_step?: StartStep } | undefined {
  if (source === undefined) return undefined;
  const record = parseRecord(source, path);
  return {
    from_step:
      record.from_step === undefined ? undefined : parseStartStep(record.from_step, `${path}.from_step`),
  };
}

function getCollectingSource(source: InputSource): CollectionInputSource | undefined {
  return source.collecting;
}

function getGenerationSource(source: InputSource): GenerationInputSource | undefined {
  return source.generation;
}

function getStyleEstimationSource(source: InputSource): StyleEstimationInputSource | undefined {
  return source.styleEstimation;
}

function parseWorkflowBlocks(
  source: InputSource,
  path: string
): {
  collecting: CollectingConfig;
  generation: ActiveInformationCollectWorkflowInput["generation"];
} {
  const collecting = parseCollection(getCollectingSource(source), `${path}.collecting`);
  const generation = parseGeneration(getGenerationSource(source), `${path}.generation`);

  return {
    collecting,
    generation,
  };
}

function parseSourceLinks(value: unknown, label: string): SourceLink[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((item, index) => {
    const record = parseRecord(item, `${label}[${index}]`);
    return {
      url: parseString(record.url, `${label}[${index}].url`),
      title: parseOptionalString(record.title, `${label}[${index}].title`),
      description: parseOptionalString(record.description, `${label}[${index}].description`),
    };
  });
}

function parseCollectedData(source: unknown, path: string): CollectedData {
  const record = parseRecord(source, path);
  return {
    methods: parseStringArray(record.methods, `${path}.methods`) as Array<CollectedData["methods"][number]>,
    accountPostsByMethod: (record.accountPostsByMethod ?? {}) as CollectedData["accountPostsByMethod"],
    searchResultsByMethod: (record.searchResultsByMethod ?? {}) as CollectedData["searchResultsByMethod"],
    seedKeywordsByMethod: (record.seedKeywordsByMethod ?? {}) as CollectedData["seedKeywordsByMethod"],
    seedUrlsByMethod: (record.seedUrlsByMethod ?? {}) as CollectedData["seedUrlsByMethod"],
  };
}

export function parseWorkflowInput(
  source: unknown,
  path = "workflowInput"
): ActiveInformationCollectWorkflowInput {
  const root = parseRecord(source, path) as InputSource;
  const blocks = parseWorkflowBlocks(root, `${path}`);
  const styleEstimation = parseStyle(getStyleEstimationSource(root), `${path}.styleEstimation`);

  return {
    collecting: blocks.collecting,
    generation: blocks.generation,
    styleEstimation,
    posting: parsePosting(root.posting, `${path}.posting`),
    dry_run: parseBoolean(root.dry_run, `${path}.dry_run`, true),
    auth: parseAuth(root.auth, `${path}.auth`),
    debug: parseDebug(root.debug, `${path}.debug`),
  };
}

export function parseGenerateAndPublishWorkflowInput(
  source: unknown,
  path = "workflowInput"
): GenerateAndPublishWorkflowInput {
  const root = parseRecord(source, path) as GenerateAndPublishInputSource;
  const blocks = parseWorkflowBlocks(root, `${path}`);
  const styleEstimation = parseStyle(getStyleEstimationSource(root), `${path}.styleEstimation`);

  return {
    collecting: blocks.collecting,
    generation: blocks.generation,
    styleEstimation,
    posting: parsePosting(root.posting, `${path}.posting`),
    dry_run: parseBoolean(root.dry_run, `${path}.dry_run`, true),
    auth: parseAuth(root.auth, `${path}.auth`),
    debug: parseDebug(root.debug, `${path}.debug`),
    collected: parseCollectedData(root.collected, `${path}.collected`),
    sources: parseSourceLinks(root.sources, `${path}.sources`),
  };
}

function parsePassiveSignalPayloadArray(
  value: unknown,
  label: string
): PassiveInformationSignalPayload[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((item, index) => item as PassiveInformationSignalPayload);
}

export function parsePassiveInformationCollectWorkflowInput(
  source: unknown,
  path = "workflowInput"
): PassiveInformationCollectWorkflowInput {
  const root = parseRecord(source, path) as PassiveInformationCollectInputSource;
  const blocks = parseWorkflowBlocks(root, `${path}`);
  if (!blocks.collecting.passive) {
    throw new Error(`${path}.collecting.passive must be set`);
  }
  const styleEstimation = parseStyle(getStyleEstimationSource(root), `${path}.styleEstimation`);
  const runtime = root.runtime === undefined ? undefined : parseRecord(root.runtime, `${path}.runtime`);

  return {
    collecting: blocks.collecting,
    generation: blocks.generation,
    styleEstimation,
    posting: parsePosting(root.posting, `${path}.posting`),
    dry_run: parseBoolean(root.dry_run, `${path}.dry_run`, true),
    auth: parseAuth(root.auth, `${path}.auth`),
    debug: parseDebug(root.debug, `${path}.debug`),
    runtime:
      runtime === undefined
        ? undefined
        : {
            processed_item_ids:
              runtime.processed_item_ids === undefined
                ? []
                : parseStringArray(runtime.processed_item_ids, `${path}.runtime.processed_item_ids`),
            pending_signals:
              runtime.pending_signals === undefined
                ? []
                : parsePassiveSignalPayloadArray(
                    runtime.pending_signals,
                    `${path}.runtime.pending_signals`
                  ),
          },
  };
}

export function getCollectMethod(input: ActiveInformationCollectWorkflowInput): ActiveCollectMethod {
  return input.collecting.active.methods[0] ?? "xapi";
}

export function getCollectMethods(input: ActiveInformationCollectWorkflowInput): ActiveCollectMethod[] {
  return input.collecting.active.methods;
}

export function getCollectionInstruction(
  input: ActiveInformationCollectWorkflowInput | GenerateAndPublishWorkflowInput
): string {
  return input.collecting.instruction;
}

export function getGenerationInstruction(
  input: ActiveInformationCollectWorkflowInput | GenerateAndPublishWorkflowInput
): string {
  return input.generation.instruction;
}
