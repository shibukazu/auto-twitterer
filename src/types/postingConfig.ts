export interface PostingConfig {
  /** 投稿時刻のジッター上限（分）。この値分の範囲でランダム化 */
  jitter_minutes?: number;
}
