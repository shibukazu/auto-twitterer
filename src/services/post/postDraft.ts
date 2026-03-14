import type { XApiAuth } from "../../types";
import { createXPost } from "../../repositories/post/xPost";
import type { PostResult } from "../../repositories/post/postRepository";

export async function postDraft(
  body: string,
  auth?: XApiAuth,
  replyBody?: string
): Promise<PostResult> {
  return createXPost(auth).post(body, replyBody);
}
