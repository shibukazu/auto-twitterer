import { Worker } from "@temporalio/worker";
import * as activities from "./activities";
import { createNativeConnection } from "./connection";
import { installConsoleOverrides } from "../utils/logger";

let fatalHandled = false;

function getTaskQueue(): string {
  return process.env.TEMPORAL_TASK_QUEUE ?? "default";
}

function getNamespace(): string {
  return process.env.TEMPORAL_NAMESPACE ?? "default";
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? err.message;
  }
  return String(err);
}

async function notifyWorkerFatal(label: string, err: unknown): Promise<void> {
  if (fatalHandled) return;
  fatalHandled = true;

  const message = formatError(err).slice(0, 1500);
  console.error("worker fatal", { label, message });
}

function registerFatalHandlers(): void {
  process.on("uncaughtException", async (err) => {
    await notifyWorkerFatal("異常終了", err);
    process.exit(1);
  });

  process.on("unhandledRejection", async (reason) => {
    await notifyWorkerFatal("unhandledRejection", reason);
    process.exit(1);
  });
}

async function main() {
  const taskQueue = getTaskQueue();
  const namespace = getNamespace();
  registerFatalHandlers();
  installConsoleOverrides();
  const connection = await createNativeConnection();
  try {
    const worker = await Worker.create({
      connection,
      namespace,
      taskQueue,
      workflowsPath: new URL("./workflows.ts", import.meta.url).pathname,
      activities,
    });

    console.info("worker started", {
      namespace,
      taskQueue,
      command: "waiting",
    });
    await worker.run();
  } catch (err) {
    await notifyWorkerFatal("実行失敗", err);
    throw err;
  } finally {
    await connection.close();
  }
}

main().catch((err) => {
  if (!fatalHandled) {
    console.error("worker startup failed", { message: err instanceof Error ? err.message : String(err) });
  }
  process.exit(1);
});
