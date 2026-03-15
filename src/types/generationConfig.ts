export interface GenerationConfig {
  /** 投稿本文のテーマ・観点・NGワードなどを含めた生成指示 */
  instruction: string;
  /** 生成本文からハッシュタグを自動生成するか */
  generate_hashtags?: boolean;
  /** スレッド投稿時に「詳細はスレッドへ」を追記するか */
  append_thread_notice?: boolean;
  /** 投稿時にソースURLを返信として付与するか */
  reply_source_url?: boolean;
}

export interface Draft {
  body: string;
  replyBody?: string;
  hashtags?: string[];
  sources?: {
    url: string;
    title?: string;
    description?: string;
  }[];
}
