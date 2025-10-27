"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { parsePartialJson } from "@ai-sdk/ui-utils";

import {
  AdvisorWorkflowResponse,
  AdvisorWorkflowResponseSchema,
} from "@/schemas/advisorWorkflowResponse";
import { type LearnerUnderstanding } from "@/schemas/learnerUnderstanding";
import { DeepResearchResultSchema } from "@/schemas/deepResearch";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { z } from "zod";
import { StreamEvent } from "@/app/api/teacher-workflow/route";
import { DeepPartial } from "ai";
import { assertNever } from "@/utils/assertNever";
import { JSONObject } from "@ai-sdk/provider";
import { LearnerUnderstandingSchema } from "@/mastra/workflows/advisorWorkflow";

export default function Home() {
  // ユーザーが現在入力しているプロンプト。送信のたびにクリアする
  const [chatInputMessage, setChatInputMessage] = useState("");

  // Loading表示のために用いる。Fetch関数でAgentを呼んでいる関係で自前でState管理必須
  const [agentProcessing, setAgentProcessing] = useState(false);

  // キャンセルとAbort Signal送信のために用いる
  const agentAbortControllerRef = useRef<AbortController | null>(null);

  // 以降、Agentのレスポンスをフロントエンド - バックエンドで繋げて、かつフロントエンドで型安全に表示するための諸定義
  // processIdはフロントエンドでのUnique判定、複数ラリー継続時などの安定性のために必須
  // DeepPartial型を用いるほうがコンポーネント側で型を気をつけるだけで安全にレンダリングできるためおすすめである
  type Process<Schema> = DeepPartial<Schema> & { processId: string };

  // 以下に含まれるものが当該チャットルームにて表示されうるオブジェクトの型。マスター
  type AgentMessageTypes = {
    "user-sent-message": Process<{ text: string }>;
    "gather-learner-understanding": Process<
      z.infer<typeof LearnerUnderstandingSchema>
    >;
    "perform-deep-research": Process<z.infer<typeof DeepResearchResultSchema>>;
    "synthesize-advisor-plan": Process<
      z.infer<typeof AdvisorWorkflowResponseSchema>
    >;
    "web-search": Process<{ query: string; isProcessing: boolean }>;
  };

  // レスポンスはチャンクとして送信されてくるため単なる文字列型で一時的に蓄積する必要がある。そのための型
  type TextOutputEachTools = {
    [k in keyof AgentMessageTypes]?: string;
  };

  // 実際に用いる配列の型に変換。タグ付きUnion
  type AgentMessageItem = {
    [K in keyof AgentMessageTypes]: {
      processName: K;
      output: AgentMessageTypes[K];
    };
  }[keyof AgentMessageTypes];
  type AgentMessages = AgentMessageItem[];

  // 以下のメッセージは、サービスによってはこのままDBへの永続化と復元を行うイメージ
  // そのため本格稼働させる際はVersioningしたほうがいいかもしれない
  const [agentMessages, setAgentMessages] = useState<AgentMessages>([]);

  // JSONをChunkから復元したときの型はどうしてもJSONObjectになってしまう。そこで型を変換するレイヤーが必要
  // asを使っているためランタイム安全ではない。本当は型ガードを個々の型ごとに実装するとより安全か
  function makeItem<K extends keyof AgentMessageTypes>(
    processName: K,
    processId: string,
    output: JSONObject,
  ): Extract<AgentMessageItem, { processName: K }> {
    return { processName, output: { ...output, processId } } as Extract<
      AgentMessageItem,
      { processName: K }
    >;
  }

  // 基本的にはIDが一致するオブジェクトがあれば差し替え、なければ追加というシンプルなロジック
  // これはWeb検索時など一度に並列で複数の同じツールを呼び出すときにツール名でUniqueを取っていると
  // 状態の更新が混ざってしまうため個々のツール呼び出しごとにRun IdはMastraが発行してくれるため
  // それを用いてフロントエンドとのマッピングを安全に行う工夫
  function addProcessOutput<K extends keyof AgentMessageTypes>(
    processName: K,
    processId: string,
    output: JSONObject,
  ) {
    setAgentMessages((prev) => {
      const last = prev.findLastIndex(
        (item) => item.output.processId === processId,
      );
      if (last >= 0) {
        // 最新要素が同じ processName → 差し替え
        return prev.toSpliced(
          last,
          1,
          makeItem(processName, processId, output),
        );
      }
      // 新規追加
      return [...prev, makeItem(processName, processId, output)];
    });
  }

  const isValidWorkflowStepName = (
    stepName: string,
  ): stepName is keyof AgentMessageTypes => {
    return (
      stepName === "gather-learner-understanding" ||
      stepName === "perform-deep-research" ||
      stepName === "synthesize-advisor-plan"
    );
  };

  // Workflowを使うとAI SDKに従ってStreamingを行うのが困難になりそう（V5対応させてFormat指定すると別の可能性あり。要検討）
  // そこで自前でメッセージの組み立てと送信を行う
  const agentSendingMessage = useMemo(() => {
    return `## User's Prompt
    ${chatInputMessage}
    
    ## Past Messages
    *The following data is already your (agent) response messages, so you must think based on existing messages. If empty, you can use zero-based thinking and response.
    ${JSON.stringify(
      agentMessages.map((item) => item.output),
      null,
      2,
    )}`;
  }, [chatInputMessage, agentMessages]);

  const onAdvisorSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!chatInputMessage.trim()) {
        return;
      }
      if (agentProcessing) {
        return;
      }

      setAgentProcessing(true);

      const controller = new AbortController();
      agentAbortControllerRef.current = controller;

      try {
        const response = await fetch("/api/teacher-workflow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: agentSendingMessage }),
          signal: controller.signal,
        });

        if (!response.body) {
          throw new Error("The workflow response did not include a stream.");
        }

        addProcessOutput("user-sent-message", chatInputMessage + Date.now(), {
          text: chatInputMessage,
        });
        setChatInputMessage("");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const textOutputEachTools: TextOutputEachTools = {};

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIndex = buffer.indexOf("\n");

          // route.tsからsend関数が実行されるたびに新しいLineが送られてくると考えてよい
          while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            newlineIndex = buffer.indexOf("\n");

            if (!line) {
              continue;
            }

            try {
              // そのため、ここのlineはroute.tsで用いているStreamEvent型になる
              const parsed = JSON.parse(line) as StreamEvent;

              switch (parsed.event) {
                case "workflow-step-output-chunk":
                  if (parsed.text && parsed.processId) {
                    const newText = parsed.text;
                    const stepName = parsed.stepName;

                    // Try to parse partial JSON for real-time rendering
                    if (stepName && isValidWorkflowStepName(stepName)) {
                      textOutputEachTools[stepName] =
                        (textOutputEachTools[stepName] ?? "") + newText;
                      const parseResult = parsePartialJson(
                        textOutputEachTools[stepName] ?? "",
                      );
                      if (
                        parseResult.state === "successful-parse" ||
                        parseResult.state === "repaired-parse"
                      ) {
                        const parsedValue = parseResult.value;
                        if (
                          typeof parsedValue === "object" &&
                          !Array.isArray(parsedValue) &&
                          parsedValue !== null
                        ) {
                          addProcessOutput(
                            stepName,
                            parsed.processId,
                            parsedValue,
                          );
                        }
                      } else {
                        console.warn(
                          "not valid state:",
                          parseResult.state,
                          "raw value:",
                          (textOutputEachTools[stepName] + newText).slice(
                            0,
                            30,
                          ),
                        );
                      }
                    } else {
                      console.warn("not valid stepName", stepName);
                    }
                  }
                  break;
                // 試験実装のため割愛
                case "error": {
                  console.log(JSON.stringify(parsed, null, 2));
                  break;
                }
                case "tool-call":
                  if (parsed.text && parsed.processId) {
                    const parseResult = parsePartialJson(parsed.text);
                    if (
                      parseResult.state === "successful-parse" ||
                      parseResult.state === "repaired-parse"
                    ) {
                      const parsedValue = parseResult.value;
                      if (
                        typeof parsedValue === "object" &&
                        !Array.isArray(parsedValue) &&
                        parsedValue !== null
                      ) {
                        addProcessOutput(parsed.toolName, parsed.processId, {
                          ...parsedValue,
                          isProcessing: true,
                        });
                      }
                    }
                  }
                  break;
                // 終了イベントもキャッチすることでツール呼び出し中の状態管理を可能にする。IDを一致させて受け取ることでisProcessingフラグを正しく管理できる
                case "tool-call-finished":
                  const parseResult = parsePartialJson(parsed.text);
                  if (
                    parseResult.state === "successful-parse" ||
                    parseResult.state === "repaired-parse"
                  ) {
                    const parsedValue = parseResult.value;
                    if (
                      typeof parsedValue === "object" &&
                      !Array.isArray(parsedValue) &&
                      parsedValue !== null
                    ) {
                      addProcessOutput(parsed.toolName, parsed.processId, {
                        ...parsedValue,
                        isProcessing: false,
                      });
                    }
                  }
                  break;
                default:
                  assertNever(parsed);
                  break;
              }
            } catch (streamError) {
              console.error(
                "Failed to parse workflow stream line",
                streamError,
              );
            }
          }
        }
      } catch (error) {
        if ((error as DOMException).name === "AbortError") {
        } else {
        }
      } finally {
        agentAbortControllerRef.current = null;
        setAgentProcessing(false);
      }
    },
    [chatInputMessage, agentProcessing],
  );

  const stopAdvisor = useCallback(() => {
    if (agentAbortControllerRef.current) {
      agentAbortControllerRef.current.abort();
      agentAbortControllerRef.current = null;
    }
    setAgentProcessing(false);
  }, []);

  // note: これは不要かもしれないが本来は画面遷移時に処理を止めるために必要
  useEffect(() => {
    return () => {
      agentAbortControllerRef.current?.abort();
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-4 py-10">
      <section className="space-y-3">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            School Counselor AI
          </h1>
          <p className="text-sm text-gray-300">
            Sandbox for trial Mastra VNext workflow at v0.20.0. You can input
            any learner's prompt and get a response with structured output and
            see tool calling and streaming output.
          </p>
        </header>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex-1 space-y-4 overflow-hidden rounded-lg border border-gray-200 bg-gray-800 p-4 shadow-sm">
          <h3 className="text-base font-semibold">Messages</h3>
          {/* 以下、各メッセージタイプごとにマッピングしてコンポーネントの表示を行う。JSONでタイプセーフなのでそれぞれ安全に扱うことができる */}
          <div className="flex flex-col gap-4 overflow-y-auto pr-1">
            {agentMessages.map((output) => {
              switch (output.processName) {
                case "gather-learner-understanding":
                  return (
                    <div key={output.output.processId}>
                      <LearnerUnderstandingCard understanding={output.output} />
                    </div>
                  );
                case "perform-deep-research":
                  return (
                    <div key={output.output.processId}>
                      <ResearchFindingsCard deepResearch={output.output} />
                    </div>
                  );
                case "synthesize-advisor-plan":
                  return (
                    <div key={output.output.processId}>
                      <TeacherResultCard result={output.output} />
                    </div>
                  );
                case "web-search":
                  return (
                    <div key={output.output.processId}>
                      <span
                        className={
                          "rounded-md border px-3 py-2 text-sm leading-relaxed"
                        }
                      >
                        検索ツール呼び出し
                        {output.output.isProcessing ? "中🔎" : "完了✅"}：
                        {output.output.query}
                      </span>
                    </div>
                  );
                case "user-sent-message":
                  return (
                    <div key={output.output.processId} className="self-end">
                      <MessageBubble text={output.output.text ?? ""} />
                    </div>
                  );
                default:
                  assertNever(output);
                  return null;
              }
            })}
          </div>
        </div>

        <form
          onSubmit={onAdvisorSubmit}
          className="space-y-3 flex flex-col rounded-lg border border-gray-200 bg-gray-800 p-4 shadow-sm"
        >
          <label htmlFor="advisor-query" className="text-sm mb-2 font-medium">
            学業の悩みを相談してね
          </label>
          <textarea
            id="advisor-query"
            value={chatInputMessage}
            onChange={(event) => setChatInputMessage(event.target.value)}
            placeholder="Describe the learner context, challenges, or goals to kick off the workflow."
            rows={4}
            className="w-full resize-none rounded-md border border-gray-300 bg-gray-800 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex items-center justify-between">
            <div className="space-x-2">
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={agentProcessing || !chatInputMessage.trim()}
              >
                {agentProcessing ? "Running Workflow…" : "Run Teacher Workflow"}
              </button>
              <button
                type="button"
                onClick={stopAdvisor}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium transition hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!agentProcessing}
              >
                Stop
              </button>
            </div>
            {agentProcessing && (
              <p className="text-xs text-gray-500">Workflow is executing…</p>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}

function MessageBubble({ text }: { text: string }) {
  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm text-gray-300 leading-relaxed ` + 'prose prose-sm max-w-none ' +
        'prose-headings:text-gray-300 prose-headings:font-bold ' +
        'prose-h1:text-xl prose-h1:mb-3 ' +
        'prose-h2:text-lg prose-h2:mb-3 ' +
        'prose-h3:text-base prose-h3:mb-3 ' +
        'prose-p:text-gray-300 prose-p:leading-normal prose-p:my-3 ' +
        'prose-a:text-indigo-300 prose-a:break-all prose-a:no-underline hover:prose-a:underline ' +
        'prose-blockquote:border-l-indigo-300 prose-blockquote:my-3 prose-blockquote:bg-primary-background prose-blockquote:py-2 prose-blockquote:pl-4 prose-blockquote:not-italic ' +
        'prose-ul:ml-6 prose-ul:my-3 prose-ul:gap-y-0 prose-ul:space-y-0 ' +
        'prose-ol:ml-6 ' +
        'prose-strong:text-gray-300 prose-strong:font-semibold'}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

function JsonPreview({ data, caption }: { data: unknown; caption?: string }) {
  if (data === undefined || data === null) {
    return null;
  }

  return (
    <details className="group rounded-md border border-gray-700/60 bg-gray-900/40">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-gray-300 group-open:text-gray-100">
        {caption ?? "JSON details"}
      </summary>
      <pre className="max-h-64 overflow-x-auto overflow-y-auto px-3 pb-3 text-xs leading-relaxed text-gray-200">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
function LearnerUnderstandingCard({
  understanding,
}: {
  understanding: DeepPartial<LearnerUnderstanding>;
}) {
  if (understanding.learnerProfile === undefined) {
    return null;
  }
  const {
    learnerProfile: { identity },
    weakness,
    strengths,
    guardianSignals,
  } = understanding;

  return (
    <div className="space-y-4 rounded-md border border-gray-700/60 bg-gray-900/50 p-4">
      <SectionHeading title="Learner Overview" />
      <div className="grid gap-3 text-sm text-gray-200 md:grid-cols-2">
        <div>
          <p className="font-medium text-gray-300">Name</p>
          {!!identity && <p className="text-gray-100">{identity.name}</p>}
        </div>
        <div>
          <p className="font-medium text-gray-300">Stage</p>
          {!!identity && <p className="text-gray-100">{identity.stage}</p>}
        </div>
      </div>
      {isStringArray(weakness) && (
        <BulletSection title="Weakness" items={weakness} />
      )}
      {!!isStringArray(strengths) && (
        <BulletSection title="Strengths" items={strengths} />
      )}
      {!!isStringArray(guardianSignals) && (
        <BulletSection title="Guardian Signals" items={guardianSignals} />
      )}
    </div>
  );
}

function ResearchFindingsCard({
  deepResearch,
}: {
  deepResearch?: DeepPartial<z.infer<typeof DeepResearchResultSchema>>;
}) {
  if (
    !deepResearch ||
    !deepResearch.searchResults ||
    deepResearch.searchResults?.length === 0
  ) {
    return null;
  }

  return (
    <div className="space-y-4">
      {deepResearch.searchResults.map((result, index) => {
        if (!result) return null;
        return (
          <div
            key={result.url + "-" + index}
            className="space-y-3 rounded-md border border-gray-700/60 bg-gray-900/50 p-4"
          >
            <SectionHeading title={result.title ?? ""} />
            <MessageBubble text={result.content ?? ""} />
            <JsonPreview data={result} caption="Full result" />
          </div>
        );
      })}
      {deepResearch?.searchResults && deepResearch.searchResults.length > 0 && (
        <JsonPreview data={deepResearch.searchResults} caption="検索結果" />
      )}
    </div>
  );
}

function TeacherResultCard({
  result,
}: {
  result: DeepPartial<AdvisorWorkflowResponse>;
}) {
  const content = (
    <div className="space-y-4">
      {result.response && (
        <>
          <MessageBubble text={result.response} />
        </>
      )}

      {result.researchSynthesis && result.researchSynthesis.length > 0 && (
        <div className="space-y-4">
          <SectionHeading title="Research Synthesis" />
          {result.researchSynthesis.map((item, index) =>
            !item ? null : (
              <div
                key={item.query ?? `research-${index}`}
                className="space-y-3 rounded-md border border-purple-500/20 bg-purple-500/5 p-4"
              >
                {item.query && (
                  <SectionHeading title={item.query} subtitle={item.headline} />
                )}
                {isStringArray(item.keyFindings) && (
                  <BulletSection
                    title="Key Findings"
                    items={item.keyFindings}
                  />
                )}
                {isStringArray(item.implications) && (
                  <BulletSection
                    title="Implications"
                    items={item.implications}
                  />
                )}
                {item.references && item.references.length > 0 && (
                  <div className="space-y-1 text-xs text-gray-300">
                    <p className="font-semibold text-gray-200">References</p>
                    <ul className="space-y-1">
                      {item.references.map((ref, refIndex) =>
                        !ref ? null : (
                          <li key={ref.url ?? `ref-${refIndex}`}>
                            {ref.url && ref.title && (
                              <a
                                href={ref.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sky-300 underline hover:text-sky-200"
                              >
                                {ref.title}
                              </a>
                            )}
                            {ref.note && (
                              <span className="ml-2 text-gray-400">
                                — {ref.note}
                              </span>
                            )}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4 rounded-md border border-green-500/30 bg-green-500/5 p-5">
      {content}
    </div>
  );
}
function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="space-y-1">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
        {title}
      </h4>
      {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
    </header>
  );
}

function BulletSection({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) {
    return null;
  }

  const toneClasses = "border-blue-400/20 bg-blue-400/5";

  return (
    <div className={`space-y-2 rounded border ${toneClasses} p-3`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-300">
        {title}
      </p>
      <ul className="space-y-1 text-sm text-gray-200">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
