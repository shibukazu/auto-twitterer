import { pathToFileURL } from "node:url";
import { resolve, relative } from "node:path";
import type {
  PassiveInformationCollectWorkflowInput,
  PassiveInformationSignalPayload,
  PassivePublishJob,
} from "../../types";

type PassiveTransformerInput = {
  workflow: PassiveInformationCollectWorkflowInput;
  payload: PassiveInformationSignalPayload;
};

type PassiveInformationTransformer = (
  input: PassiveTransformerInput
) => Promise<PassivePublishJob[] | PassivePublishJob> | PassivePublishJob[] | PassivePublishJob;

const TRANSFORMERS_DIR = resolve(process.cwd(), "transformers");

function resolveTransformerPath(transformer: string): string {
  const resolved = resolve(TRANSFORMERS_DIR, transformer);
  const rel = relative(TRANSFORMERS_DIR, resolved);
  if (rel.startsWith("..") || rel.includes("/../") || rel === "") {
    throw new Error("transformer は transformers ディレクトリ配下の相対パスで指定してください。");
  }
  return resolved;
}

async function loadTransformer(
  transformer: string
): Promise<PassiveInformationTransformer> {
  const filePath = resolveTransformerPath(transformer);
  const mod = await import(pathToFileURL(filePath).href);
  const fn = (mod.transformPassiveInformation ?? mod.default) as PassiveInformationTransformer | undefined;
  if (typeof fn !== "function") {
    throw new Error(
      `transformer "${transformer}" は default export または transformPassiveInformation を export してください。`
    );
  }
  return fn;
}

export async function transformPassiveSignal(
  workflow: PassiveInformationCollectWorkflowInput,
  payload: PassiveInformationSignalPayload
): Promise<PassivePublishJob[]> {
  const transformerPath = workflow.collecting.passive?.transformer;
  if (!transformerPath) {
    throw new Error("workflowInput.collecting.passive.transformer を設定してください。");
  }
  const transformer = await loadTransformer(transformerPath);
  const result = await transformer({ workflow, payload });
  return Array.isArray(result) ? result : [result];
}
