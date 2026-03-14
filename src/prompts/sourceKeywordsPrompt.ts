import type { CollectedData } from "../types";

export function buildSourceKeywordsPrompt(
  instruction: string,
  collected: CollectedData
): string {
  const postTexts = [
    ...Object.values(collected.accountPostsByMethod).flatMap((accounts) =>
      (accounts ?? []).flatMap(({ posts }) => posts.map((post) => post.text))
    ),
    ...Object.values(collected.searchResultsByMethod).flatMap((results) =>
      (results ?? []).flatMap(({ posts }) => posts.map((post) => post.text))
    ),
  ]
    .slice(0, 10)
    .map((t, i) => `${i + 1}. ${t.slice(0, 120)}`)
    .join("\n");

  return `あなたはウェブ検索の専門家です。

## 投稿の目的（ユーザーの指示）
${instruction}

## 収集済みの関連投稿（参考）
${postTexts || "(なし)"}

## タスク
上記の投稿目的と収集済み投稿の内容をもとに、DuckDuckGo または Firecrawl でウェブ検索するための検索キーワードを2〜3件考えてください。

条件：
- 公式ページや信頼性の高い情報源が見つかりやすいキーワードにすること
- 日本語または英語（より公式情報が見つかりやすい方を選ぶ）
- キーワードは具体的かつ短く（1〜4語程度）

以下のJSON配列形式のみで返してください：
["キーワード1", "キーワード2", "キーワード3"]

JSONのみを返してください。JSON以外の説明文は不要です。`;
}
