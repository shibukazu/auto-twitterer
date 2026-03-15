import type { AuthConfig } from "./authConfig";
import type {
  CollectedData,
  PassiveInformationSignalPayload,
  SourceLink,
} from "./collectionConfig";
import type { CollectingConfig } from "./collectionConfig";
import type { GenerationConfig } from "./generationConfig";
import type { PostingConfig } from "./postingConfig";
import type { StyleEstimationConfig } from "./styleEstimationConfig";
import type { StartStep } from "./startStep";

interface PassiveWorkflowRuntimeState {
  processed_item_ids?: string[];
  pending_signals?: PassiveInformationSignalPayload[];
}

interface BaseWorkflowInput {
  /** 収集設定（active/passive） */
  collecting: CollectingConfig;
  /** 投稿本文生成設定 */
  generation: GenerationConfig;
  /** スタイル推定設定 */
  styleEstimation: StyleEstimationConfig;
  /** 投稿投稿ルール */
  posting: PostingConfig;
  /** 実行を投稿まで止めるか */
  dry_run: boolean;
  /** 外部認証情報 */
  auth: AuthConfig;
  /** 途中再開情報 */
  debug?: {
    /** 失敗再開時の起点ステップ */
    from_step?: StartStep;
  };
}

/** active 情報収集フロー向けの入力 */
export interface ActiveInformationCollectWorkflowInput extends BaseWorkflowInput {}

/** 収集結果を受け取り投稿まで実行するフロー向けの入力 */
export interface GenerateAndPublishWorkflowInput extends BaseWorkflowInput {
  /** 収集済みデータ */
  collected: CollectedData;
  /** LLM が参照する検証済みソース */
  sources: SourceLink[];
}

/** passive 情報収集フロー向けの入力 */
export interface PassiveInformationCollectWorkflowInput extends BaseWorkflowInput {
  /** passive ワークフローの継続状態 */
  runtime?: PassiveWorkflowRuntimeState;
}
