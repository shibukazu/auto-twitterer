/** base ± jitter の範囲でランダムにスリープ（単位: ms） */
export async function sleep(baseMs: number, jitterMs = 0): Promise<void> {
  const ms = baseMs + Math.floor(Math.random() * (jitterMs + 1));
  await Bun.sleep(ms);
}
