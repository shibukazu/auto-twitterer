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

Actual posting only occurs when:

    dry_run = false

------------------------------------------------------------------------

# Workflow Input

Example input:

``` json
{
  "dry_run": true,
  "content": {
    "instruction": "Describe the type of content to generate",
    "collect": {
      "methods": ["xapi", "firecrawl"],
      "xapi": {
        "target_accounts": ["trawi_site"],
        "max_iterations": 5
      },
      "bird": {
        "target_accounts": ["example_user"],
        "max_iterations": 5
      },
      "firecrawl": {
        "keywords": "auto",
        "urls": [],
        "max_iterations": 3
      },
      "duckduckgo": {
        "keywords": ["Amazon セール"],
        "urls": [],
        "max_iterations": 3
      }
    }
  },
  "style": {
    "instruction": "Instructions describing writing style",
    "examples": [
      "Example sentence 1",
      "Example sentence 2"
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
      "authToken": "",
      "ct0": ""
    },
    "xapi": {
      "apiKey": "",
      "apiSecret": "",
      "accessToken": "",
      "accessSecret": ""
    },
    "firecrawl": {
      "apiKey": ""
    },
    "anthropic": {
      "apiKey": ""
    },
    "slack": {
      "webhookUrl": "",
      "mentionId": ""
    }
  }
}
```

------------------------------------------------------------------------

# Architecture

## Workflow Stages

The workflow consists of the following steps:

1.  **Collect**
2.  **Source validation**
3.  **Style analysis**
4.  **Post generation**
5.  **Optional publishing**

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

If `collect.methods = ["none"]`, collection is skipped.

------------------------------------------------------------------------

## Style Analysis

Style is derived from:

    style.instruction
    style.examples

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

-   content → hash of `content.instruction`
-   style → hash of `style.instruction + examples`
-   workflow → hash of entire input

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

  D --> E{methods == none?}
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
