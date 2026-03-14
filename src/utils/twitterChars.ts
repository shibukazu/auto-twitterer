export const THREAD_SUFFIX = "詳細はスレッドへ";

/**
 * ハッシュタグトークン（#〇〇）を除いた実効文字数を返す
 */
export function countEffectiveChars(body: string): number {
  return body.replace(/#\S+/g, "").trim().length;
}

/**
 * LLM が生成すべき body の文字数上限。
 * - ハッシュタグは含まない
 * - スレッド誘導文を付ける場合、「\n詳細はスレッドへ」(9文字) を後付けするため差し引く
 */
export function getBodyLimit(withThreadNotice: boolean): number {
  return withThreadNotice ? 140 - 1 - THREAD_SUFFIX.length : 140;
}

export function isWithinLimit(body: string, withThreadNotice: boolean): boolean {
  return countEffectiveChars(body) <= getBodyLimit(withThreadNotice);
}

/**
 * 最終的な drafts.json 用 body を組み立てる
 * - スレッド誘導文が有効な場合: 本文 + \n + 「詳細はスレッドへ」
 * - ハッシュタグを末尾に追加
 */
export function buildFinalBody(
  body: string,
  hashtags: string[],
  appendThreadNotice: boolean
): string {
  const parts: string[] = [body.trim()];
  if (appendThreadNotice) parts.push(THREAD_SUFFIX);
  if (hashtags.length > 0) parts.push(hashtags.join(" "));
  return parts.join("\n");
}
