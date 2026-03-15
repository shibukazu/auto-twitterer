export interface StyleEstimationConfig {
  /** 投稿文体を推定するための条件文 */
  instruction: string;
  /** 参照例文。文体推定の精度向上に使用 */
  examples?: string[];
}

export interface StyleAnalysis {
  toneAndVoice: string;
  structurePatterns: string[];
  characteristics: string[];
}
