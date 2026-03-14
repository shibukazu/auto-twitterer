/**
 * 指数バックオフ付きリトライ
 * @param fn 実行する非同期関数
 * @param maxAttempts 最大試行回数（デフォルト: 3）
 * @param baseDelayMs 初回待機時間 ms（デフォルト: 5000）
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 5000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const isOverloaded =
        err instanceof Error &&
        (err.message.includes("529") ||
          err.message.includes("overloaded") ||
          err.message.includes("529"));

      if (!isOverloaded || attempt === maxAttempts) throw err;

      const waitMs = baseDelayMs * 2 ** (attempt - 1);
      console.warn(
        `    [retry] API 過負荷 (attempt ${attempt}/${maxAttempts})、${waitMs / 1000}s 後にリトライ...`
      );
      await Bun.sleep(waitMs);
    }
  }

  throw lastError;
}
