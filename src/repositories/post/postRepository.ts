export interface PostResult {
  mainTweetId: string;
  threadTweetId?: string;
  url: string;
}

export interface PostRepository {
  post(body: string, replyBody?: string): Promise<PostResult>;
}
