import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { CounselorWorkflowResponseSchema } from "@/schemas/advisorWorkflowResponse";
import { DeepResearchResultSchema } from "@/schemas/deepResearch";

export const LearnerUnderstandingSchema = z.object({
  learnerProfile: z.object({
    identity: z.object({
      name: z.string(),
      stage: z.string(),
    }),
  }),
  weakness: z.array(z.string()).describe("生徒様の課題点"),
  strengths: z.array(z.string()).describe("生徒様の強み"),
  guardianSignals: z
    .array(z.string())
    .describe("保護者様が考えていること、求めていること、価値観など"),
  recommendedResearchQueries: z
    .array(
      z.object({
        query: z.string(),
        rationale: z.string(),
        focusArea: z.string(),
      }),
    )
    .min(1),
});

function safeParseSchema<T>(schema: z.ZodType<T>, payload?: unknown): T | null {
  if (!payload) return null;
  const result = schema.safeParse(payload);
  if (result.success) {
    return result.data;
  }
  return null;
}

const gatherLearnerUnderstandingStep = createStep({
  id: "gather-learner-understanding",
  inputSchema: z.object({
    message: z.string(),
  }),
  outputSchema: z.object({
    inquiry: z.string(),
    understanding: LearnerUnderstandingSchema,
  }),
  execute: async ({ inputData, mastra, writer }) => {
    const agent = mastra.getAgent("userUnderstandingAgent");

    const stream = await agent.stream(
      [
        {
          role: "user",
          content: `Summarize the learner based on available tools. Parent or advisor inquiry: "${inputData.message}"`,
        },
      ],
      { output: LearnerUnderstandingSchema },
    );

    // fullStreamを使うことで全てのイベントをStreamすることができる。
    // Complete stream of all chunk types including text, tool calls, reasoning, metadata, and control chunks. Provides granular access to every aspect of the model's response.
    // https://mastra.ai/en/reference/streaming/agents/MastraModelOutput
    await stream.fullStream.pipeTo(writer, {
      preventClose: true,
      preventAbort: true,
      preventCancel: true,
    });

    const response = await stream.object;

    const parsedFromObject = safeParseSchema(
      LearnerUnderstandingSchema,
      response,
    );

    const understanding = parsedFromObject ?? {
      learnerProfile: {
        identity: { name: "不明な学習者", stage: "不明な学習段階" },
      },
      weakness: ["制約情報は取得できませんでした。"],
      strengths: ["強みに関する情報は確認できませんでした。"],
      guardianSignals: ["保護者からのシグナルは取得できませんでした。"],
      recommendedResearchQueries: [
        {
          query: "ハイコミットな高校生を支援する指導フレームワーク",
          rationale:
            "学習者の詳細が不足しているため、一般的な支援策の調査が求められます。",
          focusArea: "general",
        },
      ],
    };

    return {
      inquiry: inputData.message,
      understanding,
    };
  },
});

const DeepResearchOutputSchema = z.object({
  inquiry: z.string(),
  understanding: LearnerUnderstandingSchema,
  researchFindings: DeepResearchResultSchema,
});

const MAC_QUERY_FOR_SEARCH = 1;

const performDeepResearchStep = createStep({
  id: "perform-deep-research",
  inputSchema: z.object({
    inquiry: z.string(),
    understanding: LearnerUnderstandingSchema,
  }),
  outputSchema: DeepResearchOutputSchema,
  execute: async ({ inputData, getInitData, mastra, writer }) => {
    const researchAgent = mastra.getAgent("researchAgent");

    const queries =
      inputData.understanding.recommendedResearchQueries?.slice(
        0,
        MAC_QUERY_FOR_SEARCH,
      ) ?? [];
    if (queries.length === 0) {
      queries.push({
        query:
          "holistic mentorship strategies for STEM-focused teens balancing robotics leadership",
        rationale:
          "Fallback query because learner dossier did not provide recommendations.",
        focusArea: "general",
      });
    }

    let prompt = '';
    for (const queryItem of queries) {
      prompt += [
        `Learner context: ${JSON.stringify(inputData.understanding)}`,
        `Focus area: ${queryItem.focusArea}`,
        `Research query: ${queryItem.query}
        
        ⚠️ you must generate a JSON object with the following structure. NOT output markdown style, ONLY programmable safety output`,
      ].join("\n");
    }

    console.info(getInitData().message)
    const stream = await researchAgent.stream(
      [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: getInitData().message,
        },
      ],
      {
        maxSteps: 20,
        output: DeepResearchResultSchema,
        // consumeStream error [Error: Invalid state: WritableStream is locked]
        // onStepFinish: async (step) => {
        //   await writer?.write({
        //     type: "WEB_SEARCH_TOOL",
        //     output: "{'result': 'true'}",
        //     payload: {
        //       runId: "ef9a6714-f993-4f9e-ae45-2d0f4b05e84e",
        //       stepName: "perform-deep-research",
        //     },
        //   });
        //   console.warn('writer written, tool calls count is', step.toolCalls.length)
        // }
      },
    );

    await stream.fullStream.pipeTo(writer, {
      preventClose: true,
      preventAbort: true,
      preventCancel: true,
    });

    const researchResponse = await stream.object;

    return {
      inquiry: inputData.inquiry,
      understanding: inputData.understanding,
      researchFindings: researchResponse,
    };
  },
});

const synthesizeAdvisorPlanStep = createStep({
  id: "synthesize-advisor-plan",
  inputSchema: z.object({
    inquiry: z.string(),
    understanding: LearnerUnderstandingSchema,
    researchFindings: DeepResearchResultSchema,
  }),
  outputSchema: CounselorWorkflowResponseSchema,
  execute: async ({ inputData, mastra, writer }) => {
    const synthesisAgent = mastra.getAgent("advisorSynthesisAgent");

    const stream = await synthesisAgent.stream(
      [
        {
          role: "user",
          content: `以下のデータを元に、ユーザーのInquiryに対して適切な回答を取りまとめよ。
          学習者の理解はlearnerUnderstandingセクションにまとめられており、
          Web検索の担当者がそれに応じて調べた内容とURLがresearchFindingsセクションに記載されている。
          
          [data]
          ${JSON.stringify({
            inquiry: inputData.inquiry,
            learnerUnderstanding: inputData.understanding,
            researchFindings: inputData.researchFindings,
          })}`,
        },
      ],
      {
        output: CounselorWorkflowResponseSchema,
      },
    );

    // Pipe agent's textStream to workflow writer for real-time display (per official docs)
    await stream.fullStream.pipeTo(writer);

    // Get the final structured object
    const finalObject = stream.object;
    const parsedFromObject = safeParseSchema(
      CounselorWorkflowResponseSchema,
      finalObject,
    );

    return (
      parsedFromObject ?? {
        response:
          "今回のワークフローから完全な助言プランを合成できませんでした。学習者のプロファイルとリサーチ結果を手動で見直してください。",
        researchSynthesis: [],
      }
    );
  },
});

export const counselorWorkflow = createWorkflow({
  id: "counselor-workflow",
  inputSchema: z.object({
    message: z.string(),
  }),
  outputSchema: CounselorWorkflowResponseSchema,
})
  .then(gatherLearnerUnderstandingStep)
  .then(performDeepResearchStep)
  .then(synthesizeAdvisorPlanStep)
  .commit();
