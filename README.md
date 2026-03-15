# auto-twitterer

**auto-twitterer** is a Temporal-based workflow that automatically
generates and posts content to **X (Twitter)**.

It can:

-   Collect information from multiple sources
-   Generate a post using an LLM
-   Apply style constraints
-   Optionally publish the result to X

The workflow is designed to run continuously via a Temporal worker and
can be triggered from the **Temporal UI**.

------------------------------------------------------------------------

# Features

-   **Temporal Workflow based architecture**
-   **LLM-powered content generation**
-   **Multi-source information collection**
    -   X API
    -   Bird API
    -   Firecrawl
    -   DuckDuckGo
-   **Passive RSS ingestion via Temporal Signal**
-   **Style analysis from examples**
-   **Posting jitter to randomize publish timing**
-   **Dry-run mode for testing**
-   **LaunchAgent support for macOS worker deployment**

------------------------------------------------------------------------

# Installation

``` bash
bun install
```

------------------------------------------------------------------------

# Running the Worker

Start a Temporal worker:

``` bash
bun run worker
```

For development with hot reload:

``` bash
TEMPORAL_NAMESPACE=auto-twitterer \
TEMPORAL_TASK_QUEUE=default \
bun run worker:dev
```

------------------------------------------------------------------------

# Temporal Namespace Management

List namespaces:

``` bash
bun run temporal:namespace:list
```

Create a namespace:

``` bash
TEMPORAL_NAMESPACE=auto-twitterer bun run temporal:namespace:create
```

------------------------------------------------------------------------

# LaunchAgent Deployment (macOS)

Deploy the worker as a LaunchAgent:

``` bash
TEMPORAL_NAMESPACE=auto-twitterer \
TEMPORAL_TASK_QUEUE=default \
bun run worker:launchctl:deploy
```

Stop the LaunchAgent worker:

``` bash
bun run worker:launchctl:bootout
```

Notes:

-   The deploy command generates a LaunchAgent plist from a template
-   The worker is installed to:

```{=html}
<!-- -->
```
    ~/Library/LaunchAgents/com.auto-twitterer.worker.plist

Changes to `worker.ts` are **not automatically applied** to LaunchAgent
workers.\
Redeploy or restart the worker after updates.

------------------------------------------------------------------------

# Running Workflows

Workflows are started **from the Temporal UI**, not from the CLI.

Main workflow entrypoints:

-   `activeInformationCollectWorkflow`
-   `passiveInformationCollectWorkflow`
-   `generateAndPublishWorkflow`

Actual posting only occurs when:

    dry_run = false

------------------------------------------------------------------------

# Workflow Input

Active workflow input example (`activeInformationCollectWorkflow` / `autoTweeterWorkflow`):

``` json
{
  "dry_run": true,
  "collecting": {
    "instruction": "Judge whether collected information is sufficient for generating a post, and propose next search keywords when it is not sufficient.",
    "active": {
      "methods": ["xapi", "firecrawl", "bird"],
      "xapi": {
        "target_accounts": ["OpenAI", "AnthropicAI"],
        "max_iterations": 2
      },
      "bird": {
        "target_accounts": ["xAI"],
        "max_iterations": 2
      },
      "firecrawl": {
        "keywords": "auto",
        "urls": [],
        "max_iterations": 2
      },
      "duckduckgo": {
        "keywords": ["AI development trends", "engineering operations"],
        "urls": ["https://www.google.com"],
        "max_iterations": 2
      }
    }
  },
  "generation": {
    "instruction": "Create one concise, practical post with directly applicable insights for engineering teams.",
    "generate_hashtags": false,
    "append_thread_notice": false,
    "reply_source_url": false
  },
  "styleEstimation": {
    "instruction": "Use a concise, calm tone that avoids being overly assertive. Focus on operational learnings.",
    "examples": [
      "Define incident response patterns before running large AI automations.",
      "Keep decisions lightweight: establish a rollback rule before scaling."
    ]
  },
  "posting": {
    "jitter_minutes": 15
  },
  "debug": {
    "from_step": "collect"
  },
  "auth": {
    "bird": {
      "authToken": "your_bird_auth_token",
      "ct0": "your_bird_ct0"
    },
    "xapi": {
      "apiKey": "YOUR_XAPI_API_KEY",
      "apiSecret": "YOUR_XAPI_API_SECRET",
      "accessToken": "YOUR_XAPI_ACCESS_TOKEN",
      "accessSecret": "YOUR_XAPI_ACCESS_SECRET"
    },
    "firecrawl": {
      "apiKey": "YOUR_FIRECRAWL_API_KEY"
    },
    "anthropic": {
      "apiKey": "YOUR_ANTHROPIC_API_KEY"
    },
    "slack": {
      "webhookUrl": "YOUR_SLACK_WEBHOOK_URL",
      "mentionId": "YOUR_SLACK_MENTION_ID"
    }
  }
}
```

Passive workflow input example (`passiveInformationCollectWorkflow`):

``` json
{
  "dry_run": true,
  "collecting": {
    "instruction": "Judge whether incoming RSS payloads can be turned into reliable publishing candidates.",
    "passive": {
      "source_type": "rss",
      "transformer": "example-transformer.ts",
      "continue_as_new_after_items": 100
    }
  },
  "generation": {
    "instruction": "Summarize the incoming signal and create one natural-sounding post.",
    "generate_hashtags": false,
    "append_thread_notice": false,
    "reply_source_url": true
  },
  "styleEstimation": {
    "instruction": "Keep the tone practical and concise, without sounding promotional.",
    "examples": [
      "Operational quality improves when verification is designed before implementation.",
      "Prefer resilient update flows over ad hoc releases to reduce incidents."
    ]
  },
  "posting": {
    "jitter_minutes": 15
  },
  "auth": {
    "anthropic": {
      "apiKey": "YOUR_ANTHROPIC_API_KEY"
    }
  }
}
```

Note:

- Passive workflow execution uses the same cache schema (`.cache/db.json`) as active workflow.
- `runtime.processed_item_ids` and `runtime.pending_signals` are used internally for
  duplicate suppression and restart control in `passiveInformationCollectWorkflow`.

------------------------------------------------------------------------

# Architecture

## Workflow Structure

-   `activeInformationCollectWorkflow`
    -   Current pull-based collection flow
    -   Collects information from X API / Bird / Firecrawl / DuckDuckGo
    -   Starts `generateAndPublishWorkflow` as a child workflow
-   `passiveInformationCollectWorkflow`
    -   Long-lived signal-based workflow
    -   Receives passive information such as RSS items
    -   Applies a workflow-specific transformer
    -   Starts `generateAndPublishWorkflow` as a child workflow
-   `generateAndPublishWorkflow`
    -   Shared downstream workflow
    -   Runs style analysis, draft generation, and optional posting

------------------------------------------------------------------------

## Collect Stage

Information is collected from configured methods:

-   `xapi`
-   `bird`
-   `firecrawl`
-   `duckduckgo`

Each iteration:

1.  Run all collectors in parallel
2.  Aggregate results
3.  Ask the LLM whether information is sufficient
4.  If insufficient, generate new queries and repeat

If `collecting.active.methods = []`, collection is skipped.

------------------------------------------------------------------------

## Passive Collection

-   `passiveInformationCollectWorkflow` receives passive payloads via the `ingestPassiveInformation` signal
-   Current supported source type is `rss`
-   The workflow itself does not fetch RSS feeds
-   An external bridge is expected to poll RSS and signal normalized items into Temporal

Signal payloads are transformed by a workflow-specific transformer file under:

    transformers/

Transformer files are intentionally gitignored. A tracked example is available at:

    transformers/rss.example.ts

Example signal payload:

``` json
{
  "source_type": "rss",
  "source_id": "producthunt-featured",
  "feed_url": "https://www.producthunt.com/feed/featured",
  "items": [
    {
      "guid": "item-guid",
      "title": "Example title",
      "link": "https://www.producthunt.com/posts/example",
      "summary": "Example summary",
      "published_at": "2026-03-15T00:00:00Z",
      "categories": ["AI", "Developer Tools"],
      "rank": 1
    }
  ]
}
```

Each transformer deterministically converts incoming passive payloads into one or more publish jobs.
That lets each workflow decide things like:

-   which RSS item to keep
-   whether only the top item should be posted
-   how summary text should be extracted
-   which URLs should be treated as sources

The worker loads the transformer dynamically from `workflowInput.collecting.passive.transformer`.

------------------------------------------------------------------------

## Style Analysis

Style is derived from:

    styleEstimation.instruction
    styleEstimation.examples

The analysis result is cached and reused.

------------------------------------------------------------------------

## Post Generation

Rules:

-   One post per workflow execution
-   Previous posts are loaded from history
-   Only the **latest 5 posts** are included in the prompt
-   The LLM generates a draft until it fits the character limit

Drafts are stored locally:

    .cache/drafts/

------------------------------------------------------------------------

## Posting

If `dry_run = false`:

1.  Determine posting time
2.  Apply `jitter_minutes`
3.  Wait if necessary
4.  Publish to X
5.  Optionally publish a reply

------------------------------------------------------------------------

# Cache System

Cache files are stored locally.

  Cache           Location
  --------------- ------------------------
  Runtime cache   `.cache/db.json`
  Draft cache     `.cache/drafts/*.json`

Cache keys:

-   workflow cache key → hash of the full normalized workflow input passed to the run
-   history key → hash of `generation.instruction`
-   style key → hash of `styleEstimation.instruction + examples`

------------------------------------------------------------------------

# Environment Variables

    TEMPORAL_ADDRESS=localhost:7233
    TEMPORAL_NAMESPACE=auto-twitterer
    TEMPORAL_TASK_QUEUE=default

  Variable                Description
  ----------------------- -------------------------
  `TEMPORAL_ADDRESS`      Temporal server address
  `TEMPORAL_NAMESPACE`    Temporal namespace
  `TEMPORAL_TASK_QUEUE`   Worker task queue

These values are embedded into the LaunchAgent configuration during
deployment.

------------------------------------------------------------------------

# System Flow

``` mermaid
flowchart TD
  A[Start] --> B[WorkflowInput from Temporal UI]
  B --> C[Compute cache keys]

  C --> D[Collect Information]

  D --> E{methods empty?}
  E -->|yes| F[Skip collection]
  E -->|no| G[Run collectors in parallel]

  G --> H[Aggregate results]
  H --> I[LLM evaluates sufficiency]

  I --> J{Enough data?}
  J -->|no| K[Generate next search queries]
  K --> G
  J -->|yes| L[Extract candidate sources]

  L --> M[Validate sources]
  M --> N{Verified sources?}
  N -->|no| O[Fallback search]
  O --> P[Save results]
  N -->|yes| P

  P --> Q[Analyze writing style]
  Q --> R[Generate draft]
  R --> S{Within character limit?}
  S -->|no| R
  S -->|yes| T[Save draft]

  T --> U{dry_run?}
  U -->|yes| Z[Finish]
  U -->|no| V[Resolve jitter]
  V --> W[Post to X]
  W --> X{replyBody exists?}
  X -->|yes| Y[Post reply]
  X -->|no| Z
  Y --> Z
```

------------------------------------------------------------------------

# License

MIT License
