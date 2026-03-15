# transformers

This directory stores passive transformers used by `passiveInformationCollectWorkflow`.

Each workflow can define its own transformer file and reference it from:

```json
"collecting.passive.transformer": "example-transformer.ts"
```

Transformer files are intended to be loaded at runtime from the `transformers/` directory.
In addition to production files, this repository ships an example file for reference:

- `transformers/rss.example.ts` (template)

Notes:

- The `transformers` directory is usually git-ignored in practice.
- Export either:
  - `export default <function>`
  - `export const transformPassiveInformation = <function>`
- Return value must be `PassivePublishJob[]` or `PassivePublishJob`.

Example (`rss.example.ts`):

```ts
import type {
  PassiveInformationCollectWorkflowInput,
  PassiveInformationSignalPayload,
  PassivePublishJob,
} from "../src/types";

type PassiveTransformerInput = {
  workflow: PassiveInformationCollectWorkflowInput;
  payload: PassiveInformationSignalPayload;
};

type PassiveInformationTransformer = (
  input: PassiveTransformerInput
) => PassivePublishJob[] | PassivePublishJob | Promise<PassivePublishJob[] | PassivePublishJob>;

const transformPassiveInformation: PassiveInformationTransformer = ({ payload }) => {
  const topItem = payload.items[0];
  if (!topItem?.link) return [];

  return {
    id: `${payload.source_id}:${topItem.guid ?? topItem.link}`,
    collected: {
      methods: ["rss"],
      accountPostsByMethod: {},
      searchResultsByMethod: {
        rss: [
          {
            query: payload.source_id,
            posts: [
              {
                text: [topItem.title, topItem.summary].filter(Boolean).join(" / "),
                url: topItem.link,
                timestamp: topItem.published_at,
              },
            ],
          },
        ],
      },
      seedKeywordsByMethod: {},
      seedUrlsByMethod: {},
    },
    sources: [{ url: topItem.link, title: topItem.title, description: topItem.summary }],
  };
};

export default transformPassiveInformation;
```

The returned `id` must be deterministic so duplicate suppression works across signals.
