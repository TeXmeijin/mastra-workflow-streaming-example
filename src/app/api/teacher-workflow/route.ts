import { NextRequest } from "next/server";

import { mastra } from "@/mastra/index";
import { AdvisorWorkflowResponseSchema } from "@/schemas/advisorWorkflowResponse";
import { ChunkType } from "@mastra/core";

const encoder = new TextEncoder();

// フロントエンドとの共用利用
export type StreamEvent =
  | {
      event: "workflow-step-output-chunk";
      text: string;
      stepName: string;
      processId: string;
    }
  | {
      event: "tool-call";
      text: string;
      processId: string;
      toolName: "web-search";
    }
  | {
      event: "tool-call-finished";
      text: string;
      processId: string;
      toolName: "web-search";
    }
  | { event: "error"; message: string };
export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = typeof body?.message === "string" ? body.message : null;

  const stream = new ReadableStream({
    async start(controller) {
      // 取り決めとしてEventごとに1行でChunkとみなしてフロントエンドに送ることとする
      // このように改行で区切られたJSONの集合で表現される形式を一般的にはNDJsonと呼ぶ
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      if (!message) {
        send({ event: "error", message: "No user message provided." });
        controller.close();
        return;
      }

      try {
        const workflow = mastra.getWorkflow("advisorWorkflow");
        const run = await workflow.createRunAsync();
        const workflowStream = run.streamVNext({
          inputData: { message },
          closeOnSuspend: true,
        });

        for await (const chunk of workflowStream) {
          // Workflow内の各ステップで、fullStreamからのpipeToによりStreamに以下のイベントが書き込まれてくる
          // そのときのTypeは統一的にworkflow-step-outputとなっている
          if (chunk.type === "workflow-step-output") {
            const payloadOutput = chunk.payload.output as ChunkType;
            const payload = chunk.payload;
            const stepName: string =
              typeof payload === "object" &&
              payload !== null &&
              "stepName" in payload &&
              typeof payload.stepName === "string"
                ? payload.stepName
                : typeof payload === "object" &&
                  payload !== null &&
                  "id" in payload &&
                  typeof payload.id === "string"
                ? payload.id
                : "";

            // ツール呼び出し。ここは実ツール名に依存するが、複数ツールの表示にフロントエンドが対応する必要があるときは
            // ツール名を直接sendしてしまっても構わない（ツール名の型ガードを実装する形でもいいかもしれない）
            if (
              payloadOutput.type === "tool-call" &&
              payloadOutput.payload.toolName?.includes("webSearch")
            ) {
              send({
                event: "tool-call",
                text: JSON.stringify(payloadOutput.payload?.args),
                toolName: "web-search",
                processId: payloadOutput.payload.toolCallId,
              });
            } else if (
              (payloadOutput.type === "tool-result" ||
                payloadOutput.type === "tool-error") &&
              payloadOutput.payload.toolName?.includes("webSearch")
            ) {
              // ツール呼び出し終了のイベント送信
              send({
                event: "tool-call-finished",
                text: JSON.stringify(payloadOutput.payload.args),
                toolName: "web-search",
                processId: payloadOutput.payload.toolCallId,
              });
            } else if (payloadOutput.type === "text-delta") {
              // 1文字ずつのイベント送信。Stepの出力が送られる（厳密には、Agentの出力をPipetoしているので、Stepそのものの出力ではなく、Step内で呼び出しているAgentの出力であることに注意。そのためStep内で複数のAgentを呼び出しすべてをStreamingしたい場合は、RunIDの内部仕様次第ではあるがもうひと工夫必要になるはず。Agent名を何らかの方法でIdentifyに用いるなど）
              send({
                event: "workflow-step-output-chunk",
                text: String(payloadOutput.payload.text) ?? "",
                processId: String(chunk.payload.output.runId),
                stepName,
              });
            } else {
              // console.log("[WORKFLOW STREAM] NOT LISTED OUTPUT", payloadOutput);
            }
          } else {
            console.log(
              "[WORKFLOW STREAM]",
              new Date().toISOString(),
              "type:",
              chunk.type,
            );
          }
        }

        const result = await workflowStream.result;

        if (!result) {
          send({
            event: "error",
            message: "Workflow stream finished without a result.",
          });
          controller.close();
          return;
        }

        if (result.status === "failed") {
          const errorMessage =
            (result.error instanceof Error
              ? result.error.message
              : result.error) ?? "Workflow failed without additional details.";
          send({ event: "error", message: errorMessage });
          controller.close();
          return;
        }

        if (result.status === "suspended") {
          controller.close();
          return;
        }

        const parsed = AdvisorWorkflowResponseSchema.safeParse(result.result);
        if (!parsed.success) {
          send({
            event: "error",
            message: `Workflow completed but result parsing failed: ${parsed.error.message}`,
          });
          controller.close();
          return;
        }

        controller.close();
      } catch (error) {
        send({
          event: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unexpected error while running teacher workflow.",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
