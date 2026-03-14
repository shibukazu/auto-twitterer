export type CollectMethod =
  | "none"
  | "xapi"
  | "bird"
  | "firecrawl"
  | "duckduckgo";

export type ActiveCollectMethod = Exclude<CollectMethod, "none">;
export type AccountCollectMethod = "xapi" | "bird";
export type WebCollectMethod = "firecrawl" | "duckduckgo";

export interface BirdAuth {
  authToken?: string;
  ct0?: string;
}

export interface XApiAuth {
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  accessSecret?: string;
}

export interface FirecrawlAuth {
  apiKey?: string;
}

export interface AnthropicAuth {
  apiKey?: string;
}

export interface SlackAuth {
  webhookUrl?: string;
  mentionId?: string;
}

export interface WorkflowAuth {
  bird?: BirdAuth;
  xapi?: XApiAuth;
  firecrawl?: FirecrawlAuth;
  anthropic?: AnthropicAuth;
  slack?: SlackAuth;
}

export type CollectAuth = Pick<WorkflowAuth, "bird" | "xapi">;

export interface AccountCollectConfig {
  target_accounts: string[];
  max_iterations: number;
}

export interface WebCollectConfig {
  keywords: string[] | "auto";
  urls: string[];
  max_iterations: number;
}

export interface ContentCollectConfig {
  methods: CollectMethod[];
  xapi?: AccountCollectConfig;
  bird?: AccountCollectConfig;
  firecrawl?: WebCollectConfig;
  duckduckgo?: WebCollectConfig;
}

export interface WorkflowContentInput {
  instruction: string;
  collect: ContentCollectConfig;
  generation?: {
    generate_hashtags?: boolean;
    append_thread_notice?: boolean;
    reply_source_url?: boolean;
  };
}

export interface WorkflowStyleInput {
  instruction: string;
  examples?: string[];
}

export interface WorkflowPostingInput {
  jitter_minutes?: number;
}

export interface WorkflowInput {
  content: WorkflowContentInput;
  style: WorkflowStyleInput;
  posting: WorkflowPostingInput;
  dry_run: boolean;
  auth: WorkflowAuth;
  debug?: WorkflowDebugInput;
}

export interface WorkflowGenerationInputSource {
  generate_hashtags?: boolean;
  append_thread_notice?: boolean;
  reply_source_url?: boolean;
}

export interface WorkflowAccountCollectInputSource {
  target_accounts?: unknown;
  max_iterations?: unknown;
}

export interface WorkflowWebCollectInputSource {
  keywords?: unknown;
  urls?: unknown;
  max_iterations?: unknown;
}

export interface WorkflowContentCollectInputSource {
  methods?: unknown;
  xapi?: WorkflowAccountCollectInputSource;
  bird?: WorkflowAccountCollectInputSource;
  firecrawl?: WorkflowWebCollectInputSource;
  duckduckgo?: WorkflowWebCollectInputSource;
}

export interface WorkflowContentInputSource {
  instruction?: unknown;
  collect?: WorkflowContentCollectInputSource;
  generation?: WorkflowGenerationInputSource;
}

export interface WorkflowStyleInputSource {
  instruction?: unknown;
  examples?: unknown;
}

export interface WorkflowPostingInputSource {
  jitter_minutes?: unknown;
}

export type WorkflowStartStep = "collect" | "style" | "generate" | "post";

export interface WorkflowDebugInput {
  from_step?: WorkflowStartStep;
}

export interface WorkflowAuthInputSource {
  bird?: BirdAuth;
  xapi?: XApiAuth;
  firecrawl?: FirecrawlAuth;
  anthropic?: AnthropicAuth;
  slack?: SlackAuth;
}

export interface WorkflowInputSource {
  content?: WorkflowContentInputSource;
  style?: WorkflowStyleInputSource;
  posting?: WorkflowPostingInputSource;
  dry_run?: unknown;
  auth?: WorkflowAuthInputSource;
  debug?: {
    from_step?: unknown;
  };
}

export interface Post {
  text: string;
  url: string;
  timestamp?: string;
}

export interface AccountPosts {
  account: string;
  posts: Post[];
}

export interface XSearchResult {
  query: string;
  posts: Post[];
}

export interface CollectedData {
  methods: CollectMethod[];
  accountPostsByMethod: Partial<Record<"xapi" | "bird", AccountPosts[]>>;
  searchResultsByMethod: Partial<Record<ActiveCollectMethod, XSearchResult[]>>;
  seedKeywordsByMethod: Partial<Record<"firecrawl" | "duckduckgo", string[]>>;
  seedUrlsByMethod: Partial<Record<"firecrawl" | "duckduckgo", string[]>>;
}

export interface CollectDecision {
  sufficient: boolean;
  searchQueries?: string[];
  reason?: string;
}

export interface SourceCandidate {
  url: string;
  title?: string;
  description?: string;
  context: string;
}

export interface SourceLink {
  url: string;
  title?: string;
  description?: string;
}

export interface StyleAnalysis {
  toneAndVoice: string;
  structurePatterns: string[];
  characteristics: string[];
}

export interface Draft {
  body: string;
  replyBody?: string;
  hashtags?: string[];
  sources?: SourceLink[];
}

export interface Output {
  drafts: Draft[];
}
