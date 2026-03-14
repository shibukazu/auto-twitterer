import { TwitterApi, TwitterV2IncludesHelper } from "twitter-api-v2";
import type { Post, XApiAuth } from "../../types";
import type { AccountCollectRepository } from "./collectRepository";
import { sleep } from "../../utils/sleep";

const POSTS_PER_ITERATION = 5;
const MAX_RESULTS_PER_QUERY = 10;
const SLEEP_AFTER_TWEETS_BASE = 2000;
const SLEEP_AFTER_TWEETS_JITTER = 1500;
const SLEEP_BETWEEN_QUERIES_BASE = 3000;
const SLEEP_BETWEEN_QUERIES_JITTER = 2000;

let _client: TwitterApi | null = null;
let _clientKey: string | null = null;

function createClient(auth: XApiAuth): TwitterApi {
  if (auth.apiKey && auth.apiSecret && auth.accessToken && auth.accessSecret) {
    return new TwitterApi({
      appKey: auth.apiKey,
      appSecret: auth.apiSecret,
      accessToken: auth.accessToken,
      accessSecret: auth.accessSecret,
    });
  }
  throw new Error(
    "X API 用の認証情報が不足しています。\n" +
      "WorkflowInput.auth.xapi に apiKey / apiSecret / accessToken / accessSecret を設定してください。"
  );
}

function getClient(auth?: XApiAuth): TwitterApi {
  const merged = auth ?? {};
  const key = [
    merged.apiKey ?? "",
    merged.apiSecret ?? "",
    merged.accessToken ?? "",
    merged.accessSecret ?? "",
  ].join(":");
  if (_client && _clientKey === key) return _client;
  _client = createClient(merged);
  _clientKey = key;
  return _client;
}

function normalizeTweetText(text: string, noteText?: string): string {
  return noteText?.trim() || text;
}

function isRetweet(tweet: { text: string; referenced_tweets?: Array<{ type: string }> }): boolean {
  return tweet.referenced_tweets?.some((ref) => ref.type === "retweeted") ?? tweet.text.startsWith("RT @");
}

function toPost(text: string, url: string, timestamp?: string): Post {
  return { text, url, ...(timestamp ? { timestamp } : {}) };
}

export function createXApi(auth?: XApiAuth): AccountCollectRepository {
  return {
    method: "xapi",

    async fetchAccountPosts(accounts, iteration) {
      const client = getClient(auth);
      const results = [];
      const fetchCount = POSTS_PER_ITERATION * (iteration + 1);
      const sliceStart = POSTS_PER_ITERATION * iteration;
      const sliceEnd = sliceStart + POSTS_PER_ITERATION;

      for (const username of accounts) {
        try {
          const user = await client.v2.userByUsername(username);
          const timeline = await client.v2.userTimeline(user.data.id, {
            max_results: fetchCount,
            exclude: ["retweets", "replies"],
            "tweet.fields": ["created_at", "note_tweet", "referenced_tweets"],
          });
          await sleep(SLEEP_AFTER_TWEETS_BASE, SLEEP_AFTER_TWEETS_JITTER);

          results.push({
            account: username,
            posts: timeline.tweets
              .filter((tweet) => !isRetweet(tweet))
              .slice(sliceStart, sliceEnd)
              .map((tweet) =>
                toPost(
                  normalizeTweetText(tweet.text, tweet.note_tweet?.text),
                  `https://x.com/${username}/status/${tweet.id}`,
                  tweet.created_at
                )
              ),
          });
        } catch (err) {
          console.warn(`[fetchAccountPosts:x-api] Skipping @${username}:`, err);
          results.push({ account: username, posts: [] });
        }
      }

      return results;
    },

    async searchPosts(queries) {
      const client = getClient(auth);
      const results = [];

      for (let i = 0; i < queries.length; i++) {
        const query = queries[i]!;
        if (i > 0) {
          await sleep(SLEEP_BETWEEN_QUERIES_BASE, SLEEP_BETWEEN_QUERIES_JITTER);
        }

        try {
          const search = await client.v2.search(query, {
            max_results: MAX_RESULTS_PER_QUERY,
            expansions: ["author_id"],
            "tweet.fields": ["author_id", "created_at", "note_tweet", "referenced_tweets"],
            "user.fields": ["username"],
          });
          const includes = new TwitterV2IncludesHelper(search);

          results.push({
            query,
            posts: search.tweets
              .filter((tweet) => !isRetweet(tweet))
              .map((tweet) => {
                const author = includes.author(tweet);
                const username = author?.username ?? "i";
                return toPost(
                  normalizeTweetText(tweet.text, tweet.note_tweet?.text),
                  `https://x.com/${username}/status/${tweet.id}`,
                  tweet.created_at
                );
              }),
          });
        } catch (err) {
          console.warn(`[searchX:x-api] Skipping query "${query}":`, err);
          results.push({ query, posts: [] });
        }
      }

      return results;
    },
  };
}
