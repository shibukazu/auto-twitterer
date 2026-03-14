import type { SlackAuth } from "../types";

export async function notifySlack(
  auth: SlackAuth | undefined,
  text: string,
  mention = false
): Promise<void> {
  const webhookUrl = auth?.webhookUrl;
  if (!webhookUrl) return;

  const mentionPrefix = auth?.mentionId ? `<@${auth.mentionId}> ` : "";

  const body = mention ? `${mentionPrefix}${text}` : text;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body }),
    });
  } catch {
    // 通知失敗はメイン処理に影響させない
  }
}
