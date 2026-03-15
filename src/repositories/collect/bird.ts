import { TwitterClient, resolveCredentials } from "@steipete/bird";
import type { BirdAuth, Post } from "../../types";
import type { AccountCollectRepository } from "./collectRepository";
import { sleep } from "../../utils/sleep";

const POSTS_PER_ITERATION = 5;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/131.0.0.0 Safari/537.36";

const SLEEP_AFTER_LOOKUP_BASE = 1500;
const SLEEP_AFTER_LOOKUP_JITTER = 1000;
const SLEEP_AFTER_TWEETS_BASE = 2000;
const SLEEP_AFTER_TWEETS_JITTER = 1500;
const MAX_RESULTS_PER_QUERY = 10;
const SLEEP_BETWEEN_QUERIES_BASE = 3000;
const SLEEP_BETWEEN_QUERIES_JITTER = 2000;

let _client: TwitterClient | null = null;

function mergeAuth(auth?: BirdAuth): BirdAuth | undefined {
  if (!auth) return undefined;
  return auth;
}

async function createClient(auth?: BirdAuth): Promise<TwitterClient> {
  const authToken = auth?.authToken;
  const ct0 = auth?.ct0;

  if (authToken && ct0) {
    return new TwitterClient({ cookies: { authToken, ct0 }, userAgent: USER_AGENT });
  }

  const { cookies, warnings } = await resolveCredentials({
    authToken,
    ct0,
    cookieSource: ["firefox", "chrome", "safari"],
  });

  for (const w of warnings) {
    console.warn("bird resolveCredentials warning", { warning: w });
  }

  if (!cookies.authToken) {
    throw new Error(
      "bird 用の認証 cookie が見つかりません。\n" +
        "WorkflowInput.auth.bird.authToken / ct0 を設定するか、ブラウザにログインしてください。"
    );
  }

  return new TwitterClient({ cookies, userAgent: USER_AGENT });
}

async function getClient(auth?: BirdAuth): Promise<TwitterClient> {
  if (_client && !auth?.authToken && !auth?.ct0) return _client;
  const client = await createClient(auth);
  if (!auth?.authToken && !auth?.ct0) _client = client;
  return client;
}

function isRetweetText(text: string): boolean {
  return text.startsWith("RT @");
}

function toPost(text: string, url: string, timestamp?: string): Post {
  return { text, url, ...(timestamp ? { timestamp } : {}) };
}

export function createBird(auth?: BirdAuth): AccountCollectRepository {
  const mergedAuth = mergeAuth(auth);

  return {
    method: "bird",

    async fetchAccountPosts(accounts, iteration) {
      const client = await getClient(mergedAuth);
      const results = [];
      const fetchCount = POSTS_PER_ITERATION * (iteration + 1);
      const sliceStart = POSTS_PER_ITERATION * iteration;
      const sliceEnd = sliceStart + POSTS_PER_ITERATION;

      for (const username of accounts) {
        try {
          const lookup = await client.getUserIdByUsername(username);
          await sleep(SLEEP_AFTER_LOOKUP_BASE, SLEEP_AFTER_LOOKUP_JITTER);

          if (!lookup.success || !lookup.userId) {
            const errMsg = lookup.error ?? "";
            if (errMsg.includes("403")) {
              throw new Error(
                `bird が 403 を返しました（Cloudflare ブロックの可能性）。\n` +
                  `WorkflowInput.auth.bird の認証情報を確認してください。\n` +
                  `詳細: ${errMsg.slice(0, 200)}`
              );
            }
            console.warn("bird fetchAccountPosts resolve failed", { username, error: errMsg });
            results.push({ account: username, posts: [] });
            continue;
          }

          const result = await client.getUserTweets(lookup.userId, fetchCount);
          await sleep(SLEEP_AFTER_TWEETS_BASE, SLEEP_AFTER_TWEETS_JITTER);

          if (!result.success) {
            console.warn("bird fetchAccountPosts fetch failed", { username, error: result.error });
            results.push({ account: username, posts: [] });
            continue;
          }

          results.push({
            account: username,
            posts: result.tweets
              .filter((tweet) => !isRetweetText(tweet.text))
              .slice(sliceStart, sliceEnd)
              .map((tweet) =>
                toPost(tweet.text, `https://x.com/${username}/status/${tweet.id}`, tweet.createdAt)
              ),
          });
        } catch (err) {
          console.warn("bird fetchAccountPosts skipped", { username }, err);
          results.push({ account: username, posts: [] });
        }
      }

      return results;
    },

    async searchPosts(queries) {
      const client = await getClient(mergedAuth);
      const results = [];

      for (let i = 0; i < queries.length; i++) {
        const query = queries[i]!;
        if (i > 0) {
          await sleep(SLEEP_BETWEEN_QUERIES_BASE, SLEEP_BETWEEN_QUERIES_JITTER);
        }

        try {
          const result = await client.search(query, MAX_RESULTS_PER_QUERY);
          if (!result.success) {
            console.warn("bird searchPosts failed", { query, error: result.error });
            results.push({ query, posts: [] });
            continue;
          }

          results.push({
            query,
            posts: result.tweets
              .filter((tweet) => !isRetweetText(tweet.text))
              .map((tweet) =>
                toPost(
                  tweet.text,
                  `https://x.com/${tweet.author.username}/status/${tweet.id}`,
                  tweet.createdAt ?? undefined
                )
              ),
          });
        } catch (err) {
          console.warn("bird searchPosts skipped", { query }, err);
          results.push({ query, posts: [] });
        }
      }

      return results;
    },
  };
}
