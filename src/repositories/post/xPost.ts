import { TwitterApi } from "twitter-api-v2";
import type { XApiAuth } from "../../types";
import type { PostRepository, PostResult } from "./postRepository";
import { sleep } from "../../utils/sleep";

let _client: TwitterApi | null = null;
let _clientKey: string | null = null;

function resolveAuth(
  auth?: XApiAuth
): Required<Pick<XApiAuth, "apiKey" | "apiSecret" | "accessToken" | "accessSecret">> {
  const apiKey = auth?.apiKey;
  const apiSecret = auth?.apiSecret;
  const accessToken = auth?.accessToken;
  const accessSecret = auth?.accessSecret;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    throw new Error(
      "X API の認証情報が不足しています。\n" +
        "WorkflowInput.auth.xapi に apiKey / apiSecret / accessToken / accessSecret を設定してください。"
    );
  }

  return { apiKey, apiSecret, accessToken, accessSecret };
}

function getClient(auth?: XApiAuth): TwitterApi {
  const resolved = resolveAuth(auth);
  const key = `${resolved.apiKey}:${resolved.apiSecret}:${resolved.accessToken}:${resolved.accessSecret}`;
  if (_client && _clientKey === key) return _client;

  _client = new TwitterApi({
    appKey: resolved.apiKey,
    appSecret: resolved.apiSecret,
    accessToken: resolved.accessToken,
    accessSecret: resolved.accessSecret,
  });
  _clientKey = key;
  return _client;
}

export function createXPost(auth?: XApiAuth): PostRepository {
  return {
    async post(body: string, replyBody?: string): Promise<PostResult> {
      const client = getClient(auth);
      const main = await client.v2.tweet(body);
      const mainTweetId = main.data.id;
      const url = `https://x.com/i/web/status/${mainTweetId}`;

      if (replyBody) {
        await sleep(1500, 500);
        const thread = await client.v2.tweet(replyBody, {
          reply: { in_reply_to_tweet_id: mainTweetId },
        });

        return { mainTweetId, threadTweetId: thread.data.id, url };
      }

      return { mainTweetId, url };
    },
  };
}
