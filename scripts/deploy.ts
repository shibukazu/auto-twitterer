import { homedir } from "node:os";
import { resolve } from "node:path";

const LABEL = "com.auto-twitterer.worker";

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function runLaunchctl(args: string[], allowFailure = false): void {
  const proc = Bun.spawnSync(["launchctl", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (proc.exitCode !== 0 && !allowFailure) {
    const stderr = new TextDecoder().decode(proc.stderr).trim();
    throw new Error(stderr || `launchctl ${args.join(" ")} failed`);
  }
}

async function main(): Promise<void> {
  const uid = process.getuid?.();
  if (!uid) {
    throw new Error("macOS launchd deployment requires process.getuid()");
  }

  const projectRoot = process.cwd();
  const launchAgentsDir = resolve(homedir(), "Library", "LaunchAgents");
  const plistPath = resolve(launchAgentsDir, `${LABEL}.plist`);
  const templatePath = resolve(projectRoot, "deploy", `${LABEL}.plist.template`);
  const logsDir = resolve(projectRoot, "logs");
  const stdoutPath = resolve(logsDir, "worker.log");
  const stderrPath = resolve(logsDir, "worker.error.log");
  const domainTarget = `gui/${uid}/${LABEL}`;
  const temporalAddress = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
  const temporalTaskQueue = process.env.TEMPORAL_TASK_QUEUE ?? "default";
  const temporalNamespace = process.env.TEMPORAL_NAMESPACE ?? "default";
  const bunPath = process.execPath;

  const template = await Bun.file(templatePath).text();
  const rendered = template
    .replaceAll("__LABEL__", xmlEscape(LABEL))
    .replaceAll("__BUN_PATH__", xmlEscape(bunPath))
    .replaceAll("__PROJECT_ROOT__", xmlEscape(projectRoot))
    .replaceAll("__TEMPORAL_ADDRESS__", xmlEscape(temporalAddress))
    .replaceAll("__TEMPORAL_TASK_QUEUE__", xmlEscape(temporalTaskQueue))
    .replaceAll("__TEMPORAL_NAMESPACE__", xmlEscape(temporalNamespace))
    .replaceAll("__STDOUT_PATH__", xmlEscape(stdoutPath))
    .replaceAll("__STDERR_PATH__", xmlEscape(stderrPath));

  await Bun.$`mkdir -p ${launchAgentsDir}`.quiet();
  await Bun.$`mkdir -p ${logsDir}`.quiet();
  await Bun.write(plistPath, rendered);

  runLaunchctl(["bootout", `gui/${uid}`, plistPath], true);
  runLaunchctl(["bootstrap", `gui/${uid}`, plistPath]);
  runLaunchctl(["kickstart", "-k", domainTarget]);

  console.log(`[deploy] Installed ${plistPath}`);
  console.log(
    `[deploy] Worker restarted with TEMPORAL_ADDRESS=${temporalAddress}, TEMPORAL_NAMESPACE=${temporalNamespace}, TEMPORAL_TASK_QUEUE=${temporalTaskQueue}`
  );
}

main().catch((error) => {
  console.error("[deploy] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
