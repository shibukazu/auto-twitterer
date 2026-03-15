import Anthropic from "@anthropic-ai/sdk";
import { buildGenerateDraftPrompt } from "../../prompts/generateDraftPrompt";
import { createAnthropicClient } from "../../utils/anthropic";
import type {
  AnthropicAuth,
  CollectedData,
  Draft,
  GenerateAndPublishWorkflowInput,
  SourceLink,
  StyleAnalysis,
} from "../../types";
import { isWithinLimit, buildFinalBody } from "../../utils/twitterChars";
import { withRetry } from "../../utils/retry";

const MAX_GENERATION_RETRIES = 3;

const DRAFT_TOOL: Anthropic.Tool = {
  name: "submit_drafts",
  description: "生成した X 投稿の下書きを提出する",
  input_schema: {
    type: "object" as const,
    properties: {
      drafts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            body: {
              type: "string",
              description: "投稿本文。ハッシュタグ・「詳細はスレッドへ」・URLを含まない純粋な本文テキスト。",
            },
            hashtags: {
              type: "array",
              items: { type: "string" },
              description: "ハッシュタグの配列（例: [\"#生成AI\", \"#節約\"]）",
            },
            sources: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  url: { type: "string" },
                  title: { type: "string" },
                  description: { type: "string" },
                },
                required: ["url"],
              },
              description: "検証済みソース一覧から選んだ関連ソース（なければ空配列）",
            },
          },
          required: ["body", "hashtags", "sources"],
        },
      },
    },
    required: ["drafts"],
  },
};

interface RawDraft {
  body: string;
  hashtags: string[];
  sources: SourceLink[];
}

async function callLLM(
  prompt: string,
  auth: AnthropicAuth | undefined,
  violationFeedback?: string
): Promise<RawDraft[]> {
  const client = createAnthropicClient(auth);
  const userContent = violationFeedback
    ? `${prompt}\n\n---\n⚠️ 前回の生成で文字数制限を超えたドラフトがありました：\n${violationFeedback}\n本文を短く修正して再生成してください。`
    : prompt;

  const message = await withRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      tools: [DRAFT_TOOL],
      tool_choice: { type: "tool", name: "submit_drafts" },
      messages: [{ role: "user", content: userContent }],
    })
  );

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("tool_use ブロックが返されませんでした");
  }

  const input = toolUse.input as { drafts?: RawDraft[] };
  if (!input.drafts || input.drafts.length === 0) {
    throw new Error("drafts が空です");
  }

  return input.drafts;
}

export async function generateDrafts(
  instruction: string,
  collected: CollectedData,
  style: StyleAnalysis,
  verifiedSources: SourceLink[],
  generation: NonNullable<GenerateAndPublishWorkflowInput["generation"]>,
  count: number,
  pastDrafts: string[] = [],
  auth?: AnthropicAuth
): Promise<Draft[]> {
  const generateHashtags = !!generation.generate_hashtags;
  const appendThreadNoticeOption = !!generation.append_thread_notice;
  const replySourceUrl = !!generation.reply_source_url;
  const prompt = buildGenerateDraftPrompt(
    instruction,
    collected,
    style,
    verifiedSources,
    generation,
    count,
    pastDrafts
  );

  let rawDrafts: RawDraft[] = [];
  let violationFeedback: string | undefined;

  for (let attempt = 1; attempt <= MAX_GENERATION_RETRIES; attempt++) {
    rawDrafts = await callLLM(prompt, auth, violationFeedback);
    if (rawDrafts.length < count) {
      throw new Error(`生成件数が不足しています: expected=${count}, actual=${rawDrafts.length}`);
    }

    const violations = rawDrafts
      .map((draft, index) => {
        const selectedSources = replySourceUrl ? draft.sources.slice(0, 1) : [];
        const withThreadNotice =
          appendThreadNoticeOption && replySourceUrl && selectedSources.length > 0;
        if (isWithinLimit(draft.body, withThreadNotice)) return null;
        const actual = draft.body.replace(/#\S+/g, "").trim().length;
        const limit = withThreadNotice ? 131 : 140;
        return `ドラフト${index + 1}: ${actual}文字（上限 ${limit}文字）`;
      })
      .filter((value): value is string => value !== null);

    if (violations.length === 0) break;

    if (attempt < MAX_GENERATION_RETRIES) {
      console.warn(
        `    [generateDrafts] 文字数超過 (attempt ${attempt}/${MAX_GENERATION_RETRIES}): ${violations.join(", ")}`
      );
      violationFeedback = violations.join("\n");
    } else {
      console.warn(
        `    [generateDrafts] 文字数超過のまま最終出力します: ${violations.join(", ")}`
      );
    }
  }

  return rawDrafts.slice(0, count).map((rawDraft) => {
    const hashtags = generateHashtags ? rawDraft.hashtags : [];
    const sources = replySourceUrl ? rawDraft.sources.slice(0, 1) : [];
    const appendThreadNotice =
      appendThreadNoticeOption && replySourceUrl && sources.length > 0;
    const replyBody =
      replySourceUrl && sources.length > 0
        ? sources[0]!.title
          ? `【ソース】${sources[0]!.title}\n${sources[0]!.url}`
          : `【ソース】${sources[0]!.url}`
        : undefined;

    return {
      body: buildFinalBody(rawDraft.body, hashtags, appendThreadNotice),
      ...(replyBody ? { replyBody } : {}),
      ...(hashtags.length > 0 ? { hashtags } : {}),
      ...(sources.length > 0 ? { sources } : {}),
    };
  });
}
