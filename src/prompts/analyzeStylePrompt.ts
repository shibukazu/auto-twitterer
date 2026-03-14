export function buildAnalyzeStylePrompt(
  styleInstruction: string,
  styleExamples: string[]
): string {
  const examplesSection =
    styleExamples.length > 0
      ? styleExamples.map((example, index) => `${index + 1}. ${example}`).join("\n")
      : "(なし)";

  return `あなたはSNSの文体分析の専門家です。

以下のスタイル指示と例文を分析し、文章スタイルの特徴を抽出してください。

## スタイル指示
${styleInstruction}

## 例文
${examplesSection}

## タスク
この指示と例文が意図する文体・トーン・構造を分析し、以下のJSON形式で返してください：

{
  "toneAndVoice": "全体的なトーンや語調を1〜2文で説明",
  "structurePatterns": ["構造的な特徴1", "構造的な特徴2", "..."],
  "characteristics": ["文体の特徴1", "文体の特徴2", "..."]
}

JSONのみを返してください。JSON以外の説明文は不要です。`;
}
