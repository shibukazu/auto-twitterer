import type { CollectedData } from "../types";

export function buildCollectDecidePrompt(
  instruction: string,
  collected: CollectedData,
  remainingIterations: number
): string {
  const accountSections = Object.entries(collected.accountPostsByMethod)
    .map(([method, accounts]) => {
      const section = (accounts ?? [])
        .map(({ account, posts }) => {
          if (posts.length === 0) return `@${account}: (投稿なし)`;
          return `@${account}:\n${posts.map((p) => `  - ${p.text}`).join("\n")}`;
        })
        .join("\n\n");
      return `### ${method}\n${section || "(なし)"}`;
    })
    .join("\n\n") || "(なし)";

  const searchResultsSection = Object.entries(collected.searchResultsByMethod)
    .map(([method, results]) => {
      const section = (results ?? [])
        .map(({ query, posts }) => {
          if (posts.length === 0) return `「${query}」: (結果なし)`;
          return `「${query}」:\n${posts.map((p) => `  - ${p.text}`).join("\n")}`;
        })
        .join("\n\n");
      return `### ${method}\n${section || "(なし)"}`;
    })
    .join("\n\n");

  const seedSourceSection = Object.entries(collected.seedUrlsByMethod)
    .map(([method, urls]) => `- ${method}: ${(urls ?? []).join(", ") || "(なし)"}`)
    .join("\n") || "(なし)";

  return `あなたは情報収集の判断エージェントです。

## ユーザーの指示
${instruction}

## 収集対象の method
${collected.methods.join(", ")}

## 参照アカウントから収集した投稿
${accountSections}

## 検索で収集した情報
${searchResultsSection || "(まだ検索していません)"}

## 入力で指定されたソースURL
${seedSourceSection}

## 残りループ回数
${remainingIterations} 回

## タスク
上記の情報を踏まえて、ユーザーの指示に応えるための情報が十分に集まっているかを判断してください。

- 十分な場合: "sufficient" を true にしてください
- 不十分な場合: 次ループで使う検索クエリを1〜3件提案してください
  - xapi / bird / firecrawl / duckduckgo の全 method がこのクエリを使って次の検索を行います
  - xapi / bird は参照アカウントの追加取得も継続します

以下のJSON形式のみで返してください：

十分な場合:
{"sufficient": true, "reason": "理由を一言で"}

不十分な場合:
{"sufficient": false, "searchQueries": ["クエリ1", "クエリ2"], "reason": "何が不足しているか"}`;
}
