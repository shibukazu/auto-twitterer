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
