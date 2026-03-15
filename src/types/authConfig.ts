export interface BirdAuth {
  /** Bird API の authToken（必須） */
  authToken: string;
  /** Bird API の ct0（必須） */
  ct0: string;
}

export interface XApiAuth {
  /** X APIの APIキー（必須） */
  apiKey: string;
  /** X APIの APIシークレット（必須） */
  apiSecret: string;
  /** OAuth 取得時の access_token（必須） */
  accessToken: string;
  /** OAuth 取得時の access_secret（必須） */
  accessSecret: string;
}

export interface FirecrawlAuth {
  /** Firecrawl APIキー（必須） */
  apiKey: string;
}

export interface AnthropicAuth {
  /** Anthropic APIキー（必須）。収集判定・生成共通で使用 */
  apiKey: string;
}

export interface SlackAuth {
  /** Slack へ通知を送る Webhook URL（必須） */
  webhookUrl: string;
  /** 通知先チャンネルMention ID（必須） */
  mentionId: string;
}

export interface AuthConfig {
  bird?: BirdAuth;
  xapi?: XApiAuth;
  firecrawl?: FirecrawlAuth;
  anthropic?: AnthropicAuth;
  slack?: SlackAuth;
}

export type CollectAuth = Pick<AuthConfig, "bird" | "xapi">;

export interface AuthInputSource {
  bird?: BirdAuth;
  xapi?: XApiAuth;
  firecrawl?: FirecrawlAuth;
  anthropic?: AnthropicAuth;
  slack?: SlackAuth;
}
