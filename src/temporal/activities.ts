import { Context, ApplicationFailure } from "@temporalio/activity";
import { resolve } from "path";
import { collectAndVerifySources } from "../services/collect/collectAndVerifySources";
import { analyzeStyle } from "../services/content/analyzeStyle";
import { generateDrafts } from "../services/content/generateDrafts";
import { postDraft } from "../services/post/postDraft";
import { notifySlack } from "../utils/slack";
import {
  appendDraftHistory,
  computeCacheKey,
  computeHistoryKey,
  computeStyleKey,
  dumpPosts,
  loadCollected,
  loadDrafts,
  loadDraftHistory,
  loadSources,
  loadStyle,
  saveDrafts,
  saveCollected,
  saveSources,
  saveStyle,
  setCacheKey,
  setHistoryKey,
  setStyleKey,
} from "../utils/cache";
import { getInstruction } from "../config";
import type { CollectedData, Draft, SourceLink, StyleAnalysis, WorkflowInput } from "../types";

function applyCacheKey(input: WorkflowInput): string {
  const key = computeCacheKey(input);
  setCacheKey(key);
  setHistoryKey(computeHistoryKey(input));
  setStyleKey(computeStyleKey(input));
  return key;
}

export async function notifyWorkflowFailure(input: {
  workflowId: string;
  runId: string;
  activityType?: string;
  errorMessage: string;
  slackAuth?: WorkflowInput["auth"]["slack"];
}): Promise<void> {
  const activityLabel = input.activityType ? ` (${input.activityType})` : "";
  await notifySlack(
    input.slackAuth,
    `:rotating_light: *Temporal ワークフロー失敗${activityLabel}*\nworkflowId: \`${input.workflowId}\`\nrunId: \`${input.runId}\`\n\`\`\`${input.errorMessage.slice(0, 1200)}\`\`\``,
    true
  );
}

export async function stepCollectSources(input: { input: WorkflowInput }): Promise<{
  collected: CollectedData;
  sources: import("../types").SourceLink[];
}> {
  applyCacheKey(input.input);
  Context.current().heartbeat("情報収集とソース確保中...");
  const result = await collectAndVerifySources(input.input);
  await saveCollected(result.collected);
  await dumpPosts(result.collected);
  const sources = result.sources;
  await saveSources(sources);
  return result;
}

export async function stepStyle(input: { input: WorkflowInput }): Promise<StyleAnalysis> {
  applyCacheKey(input.input);

  const cached = await loadStyle();
  if (cached) return cached;

  Context.current().heartbeat("スタイル分析中...");
  const style = await analyzeStyle(
    input.input.style.instruction,
    input.input.style.examples ?? [],
    input.input.auth.anthropic
  );
  await saveStyle(style);
  return style;
}

export async function stepGenerate(input: {
  input: WorkflowInput;
  collected: CollectedData;
  sources: SourceLink[];
  style: StyleAnalysis;
}): Promise<Draft[]> {
  const cacheKey = applyCacheKey(input.input);
  const instruction = getInstruction(input.input);

  Context.current().heartbeat("投稿文生成中...");
  const pastDrafts = await loadDraftHistory();
  const drafts = await generateDrafts(
    instruction,
    input.collected,
    input.style,
    input.sources,
    input.input.content.generation ?? {},
    1,
    pastDrafts,
    input.input.auth.anthropic
  );
  await appendDraftHistory(drafts.map((draft) => draft.body));
  await saveDrafts(drafts);

  const draftsDir = resolve(process.cwd(), ".cache", "drafts");
  await Bun.$`mkdir -p ${draftsDir}`.quiet();
  const jsonPath = resolve(draftsDir, `drafts.${cacheKey}.json`);
  await Bun.write(jsonPath, JSON.stringify({ drafts }, null, 2));

  return drafts;
}

export async function stepLoadCollected(input: { input: WorkflowInput }): Promise<{
  collected: CollectedData;
  sources: SourceLink[];
}> {
  applyCacheKey(input.input);
  return {
    collected: await loadCollected(),
    sources: await loadSources(),
  };
}

export async function stepLoadStyle(input: { input: WorkflowInput }): Promise<StyleAnalysis> {
  applyCacheKey(input.input);
  const style = await loadStyle();
  if (!style) {
    throw new Error("キャッシュ済み style が見つかりません。先に collect/style から実行してください。");
  }
  return style;
}

export async function stepLoadDrafts(input: { input: WorkflowInput }): Promise<Draft[]> {
  applyCacheKey(input.input);
  return loadDrafts();
}

export async function stepPost(input: {
  input: WorkflowInput;
  draft: Draft;
  index: number;
  total: number;
}): Promise<void> {
  Context.current().heartbeat(`投稿中 ${input.index + 1}/${input.total}`);

  try {
    const result = await postDraft(input.draft.body, input.input.auth.xapi, input.draft.replyBody);
    const preview = input.draft.body.replace(/\n/g, " ").slice(0, 30);
    const previewText = input.draft.body.length > 30 ? `${preview}…` : preview;
    const threadNote = result.threadTweetId ? "\n（スレッドにソースURL追加済み）" : "";
    await notifySlack(
      input.input.auth.slack,
      `:white_check_mark: *X 投稿完了*\n>${previewText}\n${result.url}${threadNote}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAuthError = msg.includes("403") || msg.includes("401") || msg.includes("expired");
    const emoji = isAuthError ? ":key:" : ":x:";
    const label = isAuthError ? "認証エラー（トークン期限切れの可能性）" : "投稿失敗";
    await notifySlack(input.input.auth.slack, `${emoji} *X ${label}*\n\`\`\`${msg.slice(0, 500)}\`\`\``, true);
    if (isAuthError) {
      throw ApplicationFailure.nonRetryable(msg);
    }
    throw err;
  }
}
