import type { PostingConfig } from "../types";

const MINUTE_MS = 60 * 1000;

export function resolvePostDelayMs(
  posting: PostingConfig
): number {
  const jitter = posting.jitter_minutes ?? 0;
  if (jitter <= 0) return 0;
  const range = jitter * MINUTE_MS;
  return Math.floor(Math.random() * (range + 1));
}
