import type {
  AccountCollectConfig,
  AnthropicAuth,
  BirdAuth,
  CollectMethod,
  ContentCollectConfig,
  FirecrawlAuth,
  SlackAuth,
  WebCollectConfig,
  WorkflowAuth,
  WorkflowContentCollectInputSource,
  WorkflowContentInput,
  WorkflowDebugInput,
  WorkflowGenerationInputSource,
  WorkflowInput,
  WorkflowInputSource,
  WorkflowPostingInput,
  WorkflowStartStep,
  WorkflowStyleInput,
  XApiAuth,
} from "./types";

const COLLECT_METHODS = ["none", "xapi", "bird", "firecrawl", "duckduckgo"] as const;
const WORKFLOW_START_STEPS = ["collect", "style", "generate", "post"] as const;

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

function parsePositiveInteger(value: unknown, label: string, fallback: number): number {
  if (value === undefined) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${label} must be a positive integer`);
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

function parseCollectMethod(value: unknown, label: string): CollectMethod {
  if (typeof value !== "string" || !COLLECT_METHODS.includes(value as CollectMethod)) {
    throw new Error(`${label} must be one of: ${COLLECT_METHODS.join(", ")}`);
  }
  return value as CollectMethod;
}

function parseCollectMethods(value: unknown, label: string): CollectMethod[] {
  if (value === undefined) return ["none"];
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }

  const methods = value.map((item, index) => parseCollectMethod(item, `${label}[${index}]`));
  if (methods.includes("none") && methods.length > 1) {
    throw new Error(`${label} cannot include "none" with other methods`);
  }
  return Array.from(new Set(methods));
}

function parseGeneration(
  source: WorkflowGenerationInputSource | undefined,
  path: string
): NonNullable<WorkflowContentInput["generation"]> {
  const record = source ? parseRecord(source, `${path}.generation`) : {};
  return {
    generate_hashtags: parseBoolean(
      record.generate_hashtags,
      `${path}.generation.generate_hashtags`,
      false
    ),
    append_thread_notice: parseBoolean(
      record.append_thread_notice,
      `${path}.generation.append_thread_notice`,
      false
    ),
    reply_source_url: parseBoolean(
      record.reply_source_url,
      `${path}.generation.reply_source_url`,
      false
    ),
  };
}

function parseAccountCollectConfig(
  source: unknown,
  path: string
): AccountCollectConfig {
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

function parseWebCollectConfig(
  source: unknown,
  path: string
): WebCollectConfig {
  const record = parseRecord(source, path);
  return {
    keywords: parseKeywords(record.keywords, `${path}.keywords`),
    urls: parseStringArray(record.urls, `${path}.urls`),
    max_iterations: parseMaxIterations(record.max_iterations, `${path}.max_iterations`),
  };
}

function parseCollectConfig(
  source: WorkflowContentCollectInputSource | undefined,
  path: string
): ContentCollectConfig {
  const record = source ? parseRecord(source, path) : {};
  const methods = parseCollectMethods(record.methods, `${path}.methods`);
  const collect: ContentCollectConfig = { methods };

  for (const method of methods) {
    if (method === "none") continue;
    if (method === "xapi" || method === "bird") {
      collect[method] = parseAccountCollectConfig(record[method], `${path}.${method}`);
      continue;
    }
    collect[method] = parseWebCollectConfig(record[method], `${path}.${method}`);
  }

  return collect;
}

function parseContent(
  source: unknown,
  path: string
): WorkflowContentInput {
  const record = parseRecord(source, path) as WorkflowInputSource["content"];
  return {
    instruction: parseString(record?.instruction, `${path}.instruction`),
    collect: parseCollectConfig(record?.collect, `${path}.collect`),
    generation: parseGeneration(record?.generation, path),
  };
}

function parseStyle(source: unknown, path: string): WorkflowStyleInput {
  const record = parseRecord(source, path);
  return {
    instruction: parseString(record.instruction, `${path}.instruction`),
    examples:
      record.examples === undefined
        ? []
        : parseStringArray(record.examples, `${path}.examples`),
  };
}

function parsePosting(source: unknown, path: string): WorkflowPostingInput {
  const record = source === undefined ? {} : parseRecord(source, path);
  const jitter_minutes = parseNonNegativeInteger(
    record.jitter_minutes,
    `${path}.jitter_minutes`,
    0
  );

  return {
    jitter_minutes,
  };
}

function parseOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (value === "") return undefined;
  return parseString(value, label);
}

function parseStartStep(value: unknown, label: string): WorkflowStartStep {
  if (typeof value !== "string" || !WORKFLOW_START_STEPS.includes(value as WorkflowStartStep)) {
    throw new Error(`${label} must be one of: ${WORKFLOW_START_STEPS.join(", ")}`);
  }
  return value as WorkflowStartStep;
}

function parseBirdAuth(source: unknown, path: string): BirdAuth {
  if (source === undefined) return {};
  const record = parseRecord(source, path);
  return {
    authToken: parseOptionalString(record.authToken, `${path}.authToken`),
    ct0: parseOptionalString(record.ct0, `${path}.ct0`),
  };
}

function parseXApiAuth(source: unknown, path: string): XApiAuth {
  if (source === undefined) return {};
  const record = parseRecord(source, path);
  return {
    apiKey: parseOptionalString(record.apiKey, `${path}.apiKey`),
    apiSecret: parseOptionalString(record.apiSecret, `${path}.apiSecret`),
    accessToken: parseOptionalString(record.accessToken, `${path}.accessToken`),
    accessSecret: parseOptionalString(record.accessSecret, `${path}.accessSecret`),
  };
}

function parseFirecrawlAuth(source: unknown, path: string): FirecrawlAuth {
  if (source === undefined) return {};
  const record = parseRecord(source, path);
  return {
    apiKey: parseOptionalString(record.apiKey, `${path}.apiKey`),
  };
}

function parseAnthropicAuth(source: unknown, path: string): AnthropicAuth {
  if (source === undefined) return {};
  const record = parseRecord(source, path);
  return {
    apiKey: parseOptionalString(record.apiKey, `${path}.apiKey`),
  };
}

function parseSlackAuth(source: unknown, path: string): SlackAuth {
  if (source === undefined) return {};
  const record = parseRecord(source, path);
  return {
    webhookUrl: parseOptionalString(record.webhookUrl, `${path}.webhookUrl`),
    mentionId: parseOptionalString(record.mentionId, `${path}.mentionId`),
  };
}

function parseAuth(source: unknown, path: string): WorkflowAuth {
  const record = source === undefined ? {} : parseRecord(source, path);
  return {
    bird: parseBirdAuth(record.bird, `${path}.bird`),
    xapi: parseXApiAuth(record.xapi, `${path}.xapi`),
    firecrawl: parseFirecrawlAuth(record.firecrawl, `${path}.firecrawl`),
    anthropic: parseAnthropicAuth(record.anthropic, `${path}.anthropic`),
    slack: parseSlackAuth(record.slack, `${path}.slack`),
  };
}

function parseDebug(source: unknown, path: string): WorkflowDebugInput | undefined {
  if (source === undefined) return undefined;
  const record = parseRecord(source, path);
  return {
    from_step:
      record.from_step === undefined
        ? undefined
        : parseStartStep(record.from_step, `${path}.from_step`),
  };
}

export function parseWorkflowInput(source: unknown, path = "workflowInput"): WorkflowInput {
  const root = parseRecord(source, path) as WorkflowInputSource;
  return {
    content: parseContent(root.content, `${path}.content`),
    style: parseStyle(root.style, `${path}.style`),
    posting: parsePosting(root.posting, `${path}.posting`),
    dry_run: parseBoolean(root.dry_run, `${path}.dry_run`, true),
    auth: parseAuth(root.auth, `${path}.auth`),
    debug: parseDebug(root.debug, `${path}.debug`),
  };
}

export function getCollectMethod(input: WorkflowInput): CollectMethod {
  return input.content.collect.methods[0] ?? "none";
}

export function getCollectMethods(input: WorkflowInput): CollectMethod[] {
  return input.content.collect.methods;
}

export function getInstruction(input: WorkflowInput): string {
  const base = input.content.instruction;
  const methods = getCollectMethods(input).filter((method) => method !== "none");

  if (methods.length === 0) {
    return base;
  }

  const lines = methods.flatMap((method) => {
    if (method === "bird" || method === "xapi") {
      const accounts = input.content.collect[method]?.target_accounts ?? [];
      return [`- ${method}: ${accounts.map((account) => `@${account}`).join(", ") || "(なし)"}`];
    }

    const config = input.content.collect[method] as WebCollectConfig | undefined;
    const keywords = config?.keywords === "auto" ? ["自動選定"] : (config?.keywords ?? []);
    const urls = config?.urls ?? [];
    return [
      `- ${method}: keywords=${keywords.join(", ") || "(なし)"} / urls=${urls.join(", ") || "(なし)"}`,
    ];
  });

  return `${base}\n\n参考情報ソース:\n${lines.join("\n")}`;
}
