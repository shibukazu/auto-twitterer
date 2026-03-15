export type ActiveCollectMethod = "xapi" | "bird" | "firecrawl" | "duckduckgo";
export type PassiveCollectMethod = "rss";
export type CollectMethod = ActiveCollectMethod | PassiveCollectMethod;
export type AccountCollectMethod = "xapi" | "bird";
export type WebCollectMethod = "firecrawl" | "duckduckgo";

export interface AccountCollectConfig {
  /** 参照アカウント収集時の対象ユーザーID/ハンドル */
  target_accounts: string[];
  /** 当該メソッドで最大何回収集ループを実行するか */
  max_iterations: number;
}

export interface WebCollectConfig {
  /** 検索シード。\"auto\" の場合は collection/instruction から生成 */
  keywords: string[] | "auto";
  /** 追加の手動シードURL。空配列可 */
  urls: string[];
  /** 当該メソッドで最大何回収集ループを実行するか */
  max_iterations: number;
}

export interface ActiveCollectingConfig {
  /** このワークフローでアクティブ収集するメソッド一覧 */
  methods: ActiveCollectMethod[];
  /** X API 収集設定（methods に含まれる場合必須） */
  xapi?: AccountCollectConfig;
  /** Bird 収集設定（methods に含まれる場合必須） */
  bird?: AccountCollectConfig;
  /** Firecrawl 収集設定（methods に含まれる場合必須） */
  firecrawl?: WebCollectConfig;
  /** DuckDuckGo 収集設定（methods に含まれる場合必須） */
  duckduckgo?: WebCollectConfig;
}

export interface PassiveCollectingConfig {
  /** 現在固定で \"rss\" */
  source_type: "rss";
  /** 受信データを変換する transformer ファイル名 */
  transformer: string;
  /** この件数ごとに continueAsNew を行い、履歴サイズを制御 */
  continue_as_new_after_items: number;
}

export interface CollectingConfig {
  /** LLM が収集十分性を判定・次検索語を生成するための指示 */
  instruction: string;
  /** アクティブ収集設定 */
  active: ActiveCollectingConfig;
  /** パッシブ収集設定（指定時のみ有効） */
  passive?: PassiveCollectingConfig;
}

export interface Post {
  /** 投稿本文のテキスト */
  text: string;
  /** 投稿URL */
  url: string;
  /** 投稿時刻（ISO文字列） */
  timestamp?: string;
}

export interface AccountPosts {
  /** 対象アカウントID（またはハンドル） */
  account: string;
  /** 収集した投稿一覧 */
  posts: Post[];
}

export interface XSearchResult {
  /** 検索クエリ */
  query: string;
  /** ヒット投稿 */
  posts: Post[];
}

export interface CollectedData {
  /** 実行した収集手段の一覧 */
  methods: CollectMethod[];
  /** 収集済みアカウント投稿（メソッド別） */
  accountPostsByMethod: Partial<Record<"xapi" | "bird", AccountPosts[]>>;
  /** 収集済み検索結果（全メソッド） */
  searchResultsByMethod: Partial<Record<CollectMethod, XSearchResult[]>>;
  /** 検索時の種キーワード（web系） */
  seedKeywordsByMethod: Partial<Record<"firecrawl" | "duckduckgo", string[]>>;
  /** 検索時の種URL（web系） */
  seedUrlsByMethod: Partial<Record<"firecrawl" | "duckduckgo", string[]>>;
}

export interface CollectDecision {
  /** 判定結果: 情報が十分なら true */
  sufficient: boolean;
  /** 不十分な場合、次ループで使う検索語 */
  searchQueries?: string[];
  /** 判定理由（ログ/再試行時の説明） */
  reason?: string;
}

export interface SourceCandidate {
  url: string;
  title?: string;
  description?: string;
  /** 情報由来文脈（デバッグや再現性のため） */
  context: string;
}

export interface SourceLink {
  url: string;
  title?: string;
  description?: string;
}

export interface RssPassiveItem {
  id?: string;
  guid?: string;
  title?: string;
  link?: string;
  summary?: string;
  published_at?: string;
  categories?: string[];
  author?: string;
  rank?: number;
  score?: number;
  raw?: Record<string, unknown>;
}

export interface PassiveInformationSignalPayload {
  /** パッシブソース種別（現状は rss） */
  source_type: "rss";
  /** ソースID（例: producthunt-featured） */
  source_id: string;
  /** feed URL */
  feed_url?: string;
  /** 受信したアイテム */
  items: RssPassiveItem[];
 /** 受信時刻（任意） */
  received_at?: string;
}

export interface PassivePublishJob {
  /** 投稿ワークフロー実行識別 */
  id: string;
  /** トランスフォーム後に作成した収集データ */
  collected: CollectedData;
  /** 下書き生成時に参照する source */
  sources: SourceLink[];
}
