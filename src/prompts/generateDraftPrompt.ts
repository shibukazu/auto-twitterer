import type {
  CollectedData,
  GenerateAndPublishWorkflowInput,
  SourceLink,
  StyleAnalysis,
} from "../types";
import { getBodyLimit } from "../utils/twitterChars";

const MAX_PAST_DRAFTS_IN_PROMPT = 5;

export function buildGenerateDraftPrompt(
  instruction: string,
  collected: CollectedData,
  style: StyleAnalysis,
  verifiedSources: SourceLink[],
  generation: NonNullable<GenerateAndPublishWorkflowInput["generation"]>,
  count: number,
  pastDrafts: string[] = []
): string {
  const canReplySource = !!generation.reply_source_url && verifiedSources.length > 0;
  const withThreadNotice = !!generation.append_thread_notice && canReplySource;
  const bodyLimit = getBodyLimit(withThreadNotice);

  const refPostsSection = Object.entries(collected.accountPostsByMethod)
    .flatMap(([method, accounts]) =>
      (accounts ?? []).flatMap(({ posts }) => posts.map((post) => `[${method}] ${post.text}`))
    )
    .join("\n") || "(なし)";

  const searchSection = Object.entries(collected.searchResultsByMethod)
    .flatMap(([method, results]) =>
      (results ?? []).flatMap(({ query, posts }) =>
        posts.map((post) => `[${method}:${query}] ${post.text}`)
      )
    )
    .join("\n") || "(なし)";

  const structurePatterns = style.structurePatterns.map((p) => `- ${p}`).join("\n");
  const characteristics = style.characteristics.map((c) => `- ${c}`).join("\n");

  const sourcesSection = canReplySource
    ? verifiedSources
        .map((s, i) =>
          [`[${i}] ${s.url}`, s.title ? `    タイトル: ${s.title}` : null, s.description ? `    説明: ${s.description}` : null]
            .filter(Boolean)
            .join("\n")
        )
        .join("\n")
    : "(なし)";

  const charLimitNote = withThreadNotice
    ? `本文は最大 ${bodyLimit} 文字以内（ハッシュタグを除く）。
  ※ ソースがある投稿には後で「詳細はスレッドへ」(9文字) を自動付加するため、その分を差し引いた上限です。`
    : `本文は最大 ${bodyLimit} 文字以内（ハッシュタグを除く）。`;

  const hashtagsRule = generation.generate_hashtags
    ? "- ハッシュタグは body に含めず hashtags フィールドに格納する"
    : "- hashtags フィールドは空配列にする";

  const threadNoticeRule = generation.append_thread_notice
    ? "- 「詳細はスレッドへ」は body に含めない（必要な場合のみ自動付加される）"
    : "- 「詳細はスレッドへ」は含めない";

  const sourceRule = generation.reply_source_url
    ? "- ソースURLは body に含めない（reply 用に sources へ選ぶ）"
    : "- sources フィールドは空配列にする";

  const recentPastDrafts = pastDrafts.slice(-MAX_PAST_DRAFTS_IN_PROMPT);
  const pastDraftsSection =
    recentPastDrafts.length > 0
      ? recentPastDrafts.map((b, i) => `[${i + 1}] ${b}`).join("\n\n")
      : "(なし)";

  return `あなたはX（Twitter）向けのSNSコンテンツライターです。

## ユーザーの指示
${instruction}

## 収集した情報

### 参照アカウントの最新投稿
${refPostsSection}

### 検索で収集した情報
${searchSection}

## 検証済みソース一覧
${sourcesSection}

## 参考にすべき文章スタイル
- トーン・語調: ${style.toneAndVoice}
- 構造パターン:
${structurePatterns}
- 文体の特徴:
${characteristics}

## 過去に生成した投稿（重複禁止）
以下はすでに生成済みの投稿です。同じ内容・同じ切り口の投稿は生成しないでください。
${pastDraftsSection}

## タスク
上記の指示と収集情報をもとに、X投稿の下書きを ${count} 件生成してください。

### body フィールドの条件
- 必ず日本語で書く
- 文章スタイルは「参考にすべき文章スタイル」を模倣する
- ${charLimitNote}
- ${hashtagsRule}
- ${threadNoticeRule}
- ${sourceRule}

### sources フィールドの条件
- reply_source_url が有効な場合のみ「検証済みソース一覧」から投稿内容に最も関連する **1件のみ** 選ぶ
- reply_source_url が無効な場合は空配列
- 関連するソースがなければ空配列

### 禁止事項
- 著名人・公的人物以外の個人のアカウント名・ユーザー名（@mention を含む）
- 招待コード・紹介コード・クーポンコードなど個人に紐づく固有の文字列
- 特定個人の個人情報や個人に属する固有の情報`;
}
