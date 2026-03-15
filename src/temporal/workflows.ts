import {
  proxyActivities,
  ApplicationFailure,
  ActivityFailure,
  continueAsNew,
  defineSignal,
  executeChild,
  setHandler,
  sleep,
  workflowInfo,
  condition,
} from "@temporalio/workflow";
import type * as activities from "./activities";
import {
  parseGenerateAndPublishWorkflowInput,
  parsePassiveInformationCollectWorkflowInput,
  parseWorkflowInput,
} from "../config";
import { resolvePostDelayMs } from "../utils/postSchedule";
import type { PassiveInformationSignalPayload } from "../types";

const {
  stepCollectSources,
  stepStyle,
  stepGenerate,
  stepPost,
  stepLoadCollected,
  stepLoadStyle,
  stepLoadDrafts,
  stepTransformPassiveSignal,
} = proxyActivities<typeof activities>({
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

export const ingestPassiveInformationSignal =
  defineSignal<[PassiveInformationSignalPayload]>("ingestPassiveInformation");

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

function sanitizeWorkflowIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "item";
}

async function runGenerateAndPublish(input: unknown): Promise<void> {
  const validatedInput = parseGenerateAndPublishWorkflowInput(input, "workflowInput");
  const fromStep = validatedInput.debug?.from_step ?? "style";

  let style;
  let drafts;

  if (fromStep === "style" || fromStep === "collect") {
    style = await stepStyle({ input: validatedInput });
    drafts = await stepGenerate({
      input: validatedInput,
      collected: validatedInput.collected,
      sources: validatedInput.sources,
      style,
    });
  } else if (fromStep === "generate") {
    style = await stepLoadStyle({ input: validatedInput });
    drafts = await stepGenerate({
      input: validatedInput,
      collected: validatedInput.collected,
      sources: validatedInput.sources,
      style,
    });
  } else {
    drafts = await stepLoadDrafts({ input: validatedInput });
  }

  if (!validatedInput.dry_run) {
    const delayMs = resolvePostDelayMs(validatedInput.posting);
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    await stepPost({ input: validatedInput, draft: drafts[0]!, index: 0, total: 1 });
  }
}

export async function generateAndPublishWorkflow(input: unknown): Promise<void> {
  try {
    await runGenerateAndPublish(input);
  } catch (err) {
    const info = workflowInfo();
    const formatted = formatWorkflowError(err);
    const validatedInput = parseGenerateAndPublishWorkflowInput(input, "workflowInput");
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

export async function activeInformationCollectWorkflow(input: unknown): Promise<void> {
  const validatedInput = parseWorkflowInput(input, "workflowInput");
  try {
    const fromStep = validatedInput.debug?.from_step ?? "collect";
    let collected;
    let sources;

    if (fromStep === "collect") {
      ({ collected, sources } = await stepCollectSources({ input: validatedInput }));
    } else {
      ({ collected, sources } = await stepLoadCollected({ input: validatedInput }));
    }

    await executeChild(generateAndPublishWorkflow, {
      workflowId: `${workflowInfo().workflowId}/generate-and-publish`,
      args: [
        {
          collecting: validatedInput.collecting,
          generation: validatedInput.generation,
          styleEstimation: validatedInput.styleEstimation,
          posting: validatedInput.posting,
          dry_run: validatedInput.dry_run,
          auth: validatedInput.auth,
          debug:
            fromStep === "collect"
              ? { from_step: "style" }
              : validatedInput.debug,
          collected,
          sources,
        },
      ],
    });
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
    throw err;
  }
}

export async function passiveInformationCollectWorkflow(input: unknown): Promise<void> {
  const validatedInput = parsePassiveInformationCollectWorkflowInput(input, "workflowInput");
  const pendingSignals = [...(validatedInput.runtime?.pending_signals ?? [])];
  const processedItemIds = new Set(validatedInput.runtime?.processed_item_ids ?? []);
  let processedSinceContinueAsNew = 0;

  setHandler(ingestPassiveInformationSignal, (payload) => {
    pendingSignals.push(payload);
  });

  while (true) {
    await condition(() => pendingSignals.length > 0);
    const payload = pendingSignals.shift()!;
    const jobs = await stepTransformPassiveSignal({
      input: validatedInput,
      payload,
    });

    for (const job of jobs) {
      if (processedItemIds.has(job.id)) continue;
      processedItemIds.add(job.id);
      processedSinceContinueAsNew += 1;

      await executeChild(generateAndPublishWorkflow, {
        workflowId: `${workflowInfo().workflowId}/publish/${sanitizeWorkflowIdSegment(job.id)}`,
        args: [
        {
            collecting: validatedInput.collecting,
            generation: validatedInput.generation,
            styleEstimation: validatedInput.styleEstimation,
            posting: validatedInput.posting,
            dry_run: validatedInput.dry_run,
            auth: validatedInput.auth,
            debug:
              validatedInput.debug?.from_step === "post"
                ? validatedInput.debug
                : { from_step: "style" },
            collected: job.collected,
            sources: job.sources,
          },
        ],
      });
    }

    if (
      processedSinceContinueAsNew >=
        (validatedInput.collecting.passive?.continue_as_new_after_items ?? 100) &&
      pendingSignals.length === 0
    ) {
      await continueAsNew<typeof passiveInformationCollectWorkflow>({
        ...validatedInput,
        runtime: {
          processed_item_ids: [...processedItemIds],
          pending_signals: [],
        },
      });
    }
  }
}

export async function autoTweeterWorkflow(input: unknown): Promise<void> {
  return activeInformationCollectWorkflow(input);
}
