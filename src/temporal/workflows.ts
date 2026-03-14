import {
  proxyActivities,
  ApplicationFailure,
  ActivityFailure,
  CancellationScope,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import type * as activities from "./activities";
import { parseWorkflowInput } from "../config";
import { resolvePostDelayMs } from "../utils/postSchedule";

const { stepCollectSources, stepStyle, stepGenerate, stepPost, stepLoadCollected, stepLoadStyle, stepLoadDrafts } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "30 minutes",
    heartbeatTimeout: "5 minutes",
    retry: {
      maximumAttempts: 3,
      initialInterval: "5s",
      backoffCoefficient: 2,
    },
  });

const { notifyWorkflowFailure } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    maximumAttempts: 1,
  },
});

function formatWorkflowError(err: unknown): { activityType?: string; message: string } {
  if (err instanceof ActivityFailure) {
    const cause = err.cause instanceof Error ? err.cause.message : err.message;
    return {
      activityType: err.activityType,
      message: cause,
    };
  }

  if (err instanceof Error) {
    return { message: err.message };
  }

  return { message: String(err) };
}

export async function autoTweeterWorkflow(input: unknown): Promise<void> {
  const validatedInput = parseWorkflowInput(input, "workflowInput");
  try {
    const fromStep = validatedInput.debug?.from_step ?? "collect";

    let collected;
    let sources;
    let style;
    let drafts;

    if (fromStep === "collect") {
      [{ collected, sources }, style] = await CancellationScope.cancellable(async () =>
        Promise.all([stepCollectSources({ input: validatedInput }), stepStyle({ input: validatedInput })])
      );
      drafts = await stepGenerate({ input: validatedInput, collected, sources, style });
    } else if (fromStep === "style") {
      ({ collected, sources } = await stepLoadCollected({ input: validatedInput }));
      style = await stepStyle({ input: validatedInput });
      drafts = await stepGenerate({ input: validatedInput, collected, sources, style });
    } else if (fromStep === "generate") {
      ({ collected, sources } = await stepLoadCollected({ input: validatedInput }));
      style = await stepLoadStyle({ input: validatedInput });
      drafts = await stepGenerate({ input: validatedInput, collected, sources, style });
    } else {
      drafts = await stepLoadDrafts({ input: validatedInput });
    }

    if (!validatedInput.dry_run) {
      const info = workflowInfo();
      const delayMs = resolvePostDelayMs(validatedInput.posting);
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      await stepPost({ input: validatedInput, draft: drafts[0]!, index: 0, total: 1 });
    }
  } catch (err) {
    const info = workflowInfo();
    const formatted = formatWorkflowError(err);
    try {
      await notifyWorkflowFailure({
        workflowId: info.workflowId,
        runId: info.runId,
        activityType: formatted.activityType,
        errorMessage: formatted.message,
        slackAuth: validatedInput.auth.slack,
      });
    } catch {
      // 通知失敗は元エラーを上書きしない
    }

    if (
      err instanceof ActivityFailure &&
      err.cause instanceof ApplicationFailure &&
      err.cause.nonRetryable
    ) {
      throw ApplicationFailure.nonRetryable(err.cause.message, err.cause.type);
    }
    throw err;
  }
}
