import { createTool } from "@mastra/core";
import { z } from "zod";
import { DeepResearchResultSchema } from "@/schemas/deepResearch";
import { requestOpenAiWebSearchStructured } from "@/utils/parseOpenAiWebSearchResponse";

export const webSearchByOpenAITool = createTool({
  id: "search-web-content-openai",
  description:
    "a live web search and return the top results that can be followed up by downstream tools.",
  inputSchema: z.object({
    query: z.string().describe("The search query to run"),
  }),
  outputSchema: DeepResearchResultSchema,
  execute: async ({ context }, options) => {
    const abortSignal = options?.abortSignal;
    const { query } = context;

    abortSignal?.throwIfAborted();

    return await requestOpenAiWebSearchStructured(
      `
        ${query}
        `,
      abortSignal,
    );
  },
});
