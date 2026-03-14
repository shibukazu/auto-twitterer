import type { SourceCandidate } from "../types";

export function buildVerifySourcesPrompt(
  candidates: SourceCandidate[],
  instruction: string
): string {
  const candidateList = candidates
    .map((c, i) =>
      [
        `[${i}]`,
        `URL: ${c.url}`,
        c.title ? `タイトル: ${c.title}` : null,
        c.description ? `説明: ${c.description}` : null,
        `コンテキスト: ${c.context.slice(0, 150)}`,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");

  return `あなたはファクトチェックの専門家です。

## ユーザーの指示（投稿のテーマ）
${instruction}

## ソース候補一覧
${candidateList}

## タスク
上記の候補の中から、ユーザーの指示に関連する投稿の「情報ソース（根拠）」として妥当なものを選んでください。

以下の基準で判断してください：
- 採用する: 公式発表・ニュース記事・信頼できる組織のWebページ・著名な個人/組織のX投稿など、一次情報または信頼できる情報源
- 除外する: 個人の感想・コメント・非著名な個人のX投稿・宣伝目的のページ・内容と無関係なURL

採用したソース候補のインデックス番号と、タイトル・説明を以下のJSON配列で返してください：

[
  {
    "index": 0,
    "url": "そのままコピー",
    "title": "タイトル（不明なら短い説明文を作成）",
    "description": "1〜2文の説明（日本語）"
  }
]

採用するものが0件の場合は空配列 [] を返してください。
JSONのみを返してください。JSON以外の説明文は不要です。`;
}
