[日本語](https://github.com/TeXmeijin/mastra-workflow-vnext-example/blob/main/README.ja.md)

# Streaming Multi-Agent Workflows in Production: A Technical Study of Mastra v0.20 with Real-Time Rendering

## Abstract

This repository presents a comprehensive implementation study of streaming multi-agent workflows using Mastra v0.20 framework integrated with Next.js App Router architecture. We demonstrate a production-ready approach to real-time workflow visualization through NDJSON streaming, partial JSON parsing, and progressive UI rendering. Our implementation encompasses a three-stage advisory workflow—learner understanding, deep research, and synthesis—that exemplifies the architectural advantages of workflow-based agent orchestration over single-agent approaches. Key technical contributions include: (1) selective streaming of high-value tool events (currently web-search) through `fullStream.pipeTo`, (2) client-side progressive rendering with `parsePartialJson`, and (3) stateful management of multi-step agent outputs with replace/append semantics. The system achieves responsive user experience by exposing intermediate workflow states while sharing Zod schemas across layers and documenting remaining runtime validation gaps.

---

**Implementation Note**: While this project utilized AI coding assistants (Claude Code, Codex) for implementation support, the core streaming protocol architecture—particularly the `fullStream.pipeTo(writer)` pattern and NDJSON event multiplexing—was developed through the author's direct observation of Mastra's internal event structures and iterative experimentation.

---

## 1. Introduction

### 1.1 Background and Motivation

**User Experience Requirements in Consumer-Facing AI Services**

Complex reasoning tasks increasingly require coordination among multiple specialized AI agents—learner profiling, deep research, advisory synthesis—to deliver comprehensive solutions. However, consumer-facing services face stringent UX constraints: users abandon interactions lasting more than a few seconds without visible progress. Real-time transparency of intermediate outputs is not optional but essential to prevent user churn and maintain engagement.

**Established Foundations and Their Limitations**

Prior research ([Manalink Dev: Teacher Search Agent](https://zenn.dev/manalink_dev/articles/teacher-search-agent-by-mastra)) demonstrated that streaming structured data with single AI agents can meet these UX requirements. Techniques such as `parsePartialJson()` for reconstructing incomplete JSON, `DeepPartial<T>` types for partially-generated objects, and careful UI rendering successfully enable real-time visibility for single-agent workflows.

Yet single-agent architectures inherently limit problem complexity. When tasks demand multi-step reasoning, iterative research with tool invocations, and synthesis across information sources, coordinating multiple specialized agents through workflows becomes architecturally necessary. Mastra v0.20's `workflow.createRunAsync().streamVNext()` provides workflow orchestration, but **nested tool invocations** (Workflow → Step → Agent → Tool) remain opaque without explicit streaming implementation. A 15-second web search executed by a research agent within a workflow step produces a frozen UI—unacceptable in consumer contexts.

**Contribution: Meeting Stringent UX Requirements for Complex Multi-Agent Tasks**

This study addresses the architectural gap by implementing streaming mechanisms for multi-agent workflows. By propagating tool invocations and intermediate states through the workflow hierarchy via `fullStream.pipeTo(writer)` and intentional server-side filtering, we demonstrate that complex multi-agent systems can surface the highest-value signals without overwhelming the client. The reference implementation currently forwards web-search tool calls—an easily understood proxy for research progress—while keeping the door open for additional tools when product requirements demand fuller transparency. This enables consumer-facing services to leverage sophisticated multi-agent reasoning without compromising user experience—a critical requirement for production deployment.

### 1.2 Objectives

This technical study addresses workflow streaming challenges:

1. **Stream prioritized tool invocations**: Expose high-value tool calls (currently web-search events) from agents running inside workflow steps to the client in real-time while keeping less relevant noise server-side
2. **Maintain structured output parsing**: Apply `parsePartialJson()` techniques from single-agent patterns to multi-step workflows
3. **Implement workflow-aware UI rendering**: Route streaming events to appropriate UI components based on workflow step names
4. **Maintain schema contracts**: Share Zod schemas across layers, clarify current runtime validation coverage, and outline next steps

**Technical Contributions**:
- **fullStream mechanism**: Utilization of `fullStream` to expose tool calls within workflows—a pattern not documented in official workflow streaming guides
- **Selective tool streaming**: Server-side filtering forwards web-search tool events by default, reducing noise while allowing product teams to opt in to additional tools when needed
- **Deep streaming architecture**: `stream.fullStream.pipeTo(writer)` pattern to propagate tool events through workflow → agent → tool hierarchy
- **NDJSON event protocol**: Lightweight protocol for multiplexing text deltas, tool calls, and errors with step-level routing
- **Progressive JSON reconstruction**: Client-side `parsePartialJson()` integration adapted for multi-step workflows with replace/append semantics

## 2. Architecture and Methodology

### 2.1 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client (page.tsx)                       │
│  • ReadableStreamDefaultReader                             │
│  • TextDecoder + NDJSON parsing                            │
│  • parsePartialJson (streaming JSON reconstruction)        │
│  • Replace/Append rendering semantics                      │
└──────────────────────┬──────────────────────────────────────┘
                       │ NDJSON over HTTP
┌──────────────────────▼──────────────────────────────────────┐
│              API Route (route.ts)                           │
│  • run.streamVNext({ closeOnSuspend: true })               │
│  • Event filtering: text-delta + web-search tool-call      │
│  • NDJSON encoding: { event, stepName, text }              │
└──────────────────────┬──────────────────────────────────────┘
                       │ AsyncIterator
┌──────────────────────▼──────────────────────────────────────┐
│          Mastra Workflow (advisorWorkflow.ts)               │
│  Step 1: gather-learner-understanding                       │
│  Step 2: perform-deep-research (maxSteps: 20)              │
│  Step 3: synthesize-advisor-plan                            │
│  • stream.fullStream.pipeTo(writer)                         │
│  • Structured output via Zod schemas                        │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Key Components

| Component | File Path | Responsibility |
|-----------|-----------|----------------|
| Workflow Definition | `src/mastra/workflows/advisorWorkflow.ts` | Three-step DAG with schema-validated I/O |
| Streaming Endpoint | `src/app/api/counselor-workflow/route.ts` | NDJSON stream generation from workflow events |
| Frontend UI | `src/app/page.tsx` | Progressive rendering with partial JSON parsing |
| Shared Schemas | `src/schemas/*.ts` | Type-safe contracts across layers |

## 3. Implementation Details

### 3.1 fullStream vs. textStream: Event Propagation Mechanisms

Mastra's official [Workflow Streaming documentation](https://mastra.ai/en/docs/streaming/workflow-streaming) demonstrates piping an agent's `textStream` to a workflow writer via the `pipeTo` method defined in the [Streams API](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/pipeTo):

```typescript
await stream.textStream.pipeTo(writer);
```

The `textStream` property emits only final text output, excluding tool invocations and intermediate reasoning. According to Mastra's [Agent.stream() reference](https://mastra.ai/en/reference/streaming/agents/stream), the alternative `fullStream` property exposes all chunk types through a `ReadableStream` interface:
- `text-delta`: Incremental token generation
- `tool-call`: Tool invocation with arguments
- `tool-result`: Tool execution results
- `reasoning-delta`: Model reasoning traces (if supported)
- `finish`: Stream completion

By replacing `textStream` with `fullStream` in workflow steps (advisorWorkflow.ts:98, 212):

```typescript
await stream.fullStream.pipeTo(writer, {
  preventClose: true,
  preventAbort: true,
  preventCancel: true,
});
```

All agent events—including tool calls—propagate through the workflow hierarchy to the API endpoint. The `pipeTo` method transfers data between a `ReadableStream` and a `WritableStream`, with the additional options controlling stream lifecycle behavior.

**Bandwidth Mitigation Through Event Filtering**

The `fullStream` property emits significantly more data than `textStream`. To keep the UI focused on high-signal updates, the API route implements server-side event filtering and forwards only web-search tool calls alongside text deltas (route.ts:137-154). Additional tools can be whitelisted with a single conditional when product requirements evolve:

```typescript
if (payloadOutput.type === "tool-call" && payloadOutput.payload?.toolName?.includes('webSearch')) {
  send({
    event: "tool-call",
    text: JSON.stringify(payloadOutput.payload?.args),
    toolName: 'web-search',
    stepName,
  });
} else if (payloadOutput.type === "text-delta") {
  send({
    event: "text-chunk",
    text: String(payloadOutput.payload?.text) ?? "",
    stepName,
  });
}
// Other event types are filtered out
```

Only `text-delta` and specific `tool-call` events reach the client. Events like `tool-result` (which may contain large response payloads) and internal `reasoning-delta` chunks are discarded server-side.

### 3.2 Workflow Definition: advisorWorkflow.ts

The workflow implements a directed acyclic graph (DAG) with three sequential steps, each validated through Zod schemas:

**Step 1: Learner Understanding** (`gather-learner-understanding`, lines 60-140)
```typescript
const stream = await agent.stream([...], { output: LearnerUnderstandingSchema });
await stream.fullStream.pipeTo(writer, {
  preventClose: true,
  preventAbort: true,
  preventCancel: true,
});
```

**Why `fullStream`?**: The `fullStream` property exposes all intermediate events including `text-delta` and `tool-call` events, enabling real-time UI updates. In contrast, `textStream` only provides final text output, losing visibility into tool invocations.

**Step 2: Deep Research** (`perform-deep-research`, lines 150-226)
- Executes `maxSteps: 20` to enable iterative tool usage
- Web search tool invocations are streamed via `fullStream.pipeTo(writer)` (line 212)
- Returns structured `DeepResearchResultSchema` with search results and learnings

**Step 3: Advisory Synthesis** (`synthesize-advisor-plan`, lines 228-320)
- Combines learner profile and research findings
- Final `pipeTo` call omits `preventClose: true`, allowing stream closure (line 261)

**Key Design Decision**: Each step pipes its agent's `fullStream` to the workflow `writer`, ensuring all intermediate token deltas and tool calls propagate to the API endpoint. This architecture enables the frontend to display "Searching for X..." notifications in real time.

### 3.2 Streaming Logic: route.ts

**Event Filtering and Transformation** (lines 120-163)

The API route converts Mastra's internal event stream to a simplified NDJSON protocol:

```typescript
for await (const chunk of workflowStream) {
  if (chunk.type === "workflow-step-output") {
    const payloadOutput = chunk.payload.output;

    if (payloadOutput.type === "tool-call" && payloadOutput.payload?.toolName?.includes('webSearch')) {
      send({
        event: "tool-call",
        text: JSON.stringify(payloadOutput.payload?.args),
        toolName: 'web-search',
        stepName,
      });
    } else if (payloadOutput.type === "text-delta") {
      send({
        event: "text-chunk",
        text: String(payloadOutput.payload?.text) ?? "",
        stepName,
      });
    }
  }
}
```

**Protocol Design**:
- `event: "text-chunk"`: Incremental token delta from agent LLM output
- `event: "tool-call"`: Tool invocation with serialized arguments
- `event: "error"`: Error propagation with message

**Critical Implementation Detail**: The `stepName` extraction (lines 124-135) enables the frontend to route events to the correct UI component, supporting parallel visualization of multiple workflow steps.

### 3.3 Frontend Rendering: page.tsx

**Streaming Consumption** (lines 119-207)

```typescript
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  let newlineIndex = buffer.indexOf('\n');
  while (newlineIndex !== -1) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);

    const parsed = JSON.parse(line) as StreamEvent;
    // Process event...
  }
}
```

**Progressive JSON Reconstruction** (lines 150-176)

The frontend accumulates text deltas per step and attempts progressive parsing:

```typescript
textOutputEachTools[stepName] = (textOutputEachTools[stepName] ?? '') + newText;
const parseResult = parsePartialJson(textOutputEachTools[stepName]);

if (parseResult.state === "successful-parse" || parseResult.state === "repaired-parse") {
  addProcessOutput(stepName, parseResult.value);
}
```

**Replace vs. Append Semantics** (lines 64-80)

```typescript
function addProcessOutput(processName, output, mode = 'replace') {
  setOutputEachTools((prev) => {
    const last = prev[prev.length - 1];
    if (last && last.processName === processName && mode === 'replace') {
      // Same step → Replace with updated partial parse
      const next = prev.slice(0, -1);
      next.push(makeItem(processName, output));
      return next;
    }
    // Different step → Append new entry
    return [...prev, makeItem(processName, output)];
  });
}
```

**Design Rationale**:
- **Replace mode**: Used for agent text outputs where partial JSON progressively becomes more complete
- **Append mode**: Used for tool calls (line 195) where each invocation is a distinct event

**`parsePartialJson` Mechanism**:
The `@ai-sdk/ui-utils` library provides repair heuristics for incomplete JSON:
- Unclosed braces are automatically closed
- Truncated strings are terminated
- Incomplete arrays are completed
This enables rendering of partial agent outputs (e.g., showing the first 2 of 5 array elements) before the entire response completes.

## 4. Results and Analysis

### 4.1 Streaming Characteristics

- **Transparency**: Web-search tool calls surface as dedicated events (currently labeled `検索🔎：...` in the sample UI), allowing observers to track research progress without exposing every internal tool.
- **Responsiveness**: Partial learner, research, and synthesis JSON payloads render incrementally as soon as `parsePartialJson` can repair a valid structure, so stakeholders can react while the workflow is still running.
- **Control**: `AbortController` enables mid-workflow termination, helping product teams manage token usage and API costs in long-running sessions.

### 4.2 Streaming Architecture Comparison

Based on prior work ([Teacher Search Agent](https://zenn.dev/manalink_dev/articles/teacher-search-agent-by-mastra)), single-agent streaming is straightforward, while multi-agent workflow streaming requires additional architectural complexity.

| Dimension | Single-Agent Streaming | Workflow Streaming (This Study) |
|-----------|------------------------|--------------------------------|
| **API Pattern** | `agent.stream()` → API Route → Client | `workflow.createRunAsync().streamVNext()` → API Route → Client |
| **Event Source** | Single agent's LLM output stream | Multiple agents across workflow steps |
| **Tool Call Visibility** | Directly available in agent stream | Requires `fullStream.pipeTo(writer)` propagation |
| **Client Integration** | AI SDK hooks (`useChat`, `useObject`) | Custom NDJSON stream parser |
| **Event Routing** | Not required (single source) | Step-name-based routing to UI components |
| **Partial JSON Parsing** | `parsePartialJson()` on single stream | `parsePartialJson()` per step with replace/append logic |
| **Implementation Complexity** | Low (documented pattern) | High (undocumented, requires event inspection) |

## 5. Setup and Usage

### 5.1 Installation

```bash
npm install
```

### 5.2 Environment Configuration

Required environment variables:

```bash
export OPENAI_API_KEY=sk-...
export FIRECRAWL_API_KEY=fc-...  # For web search functionality
```

Or persist in `.env.local`:
```
OPENAI_API_KEY=sk-...
FIRECRAWL_API_KEY=fc-...
```

### 5.3 Development Server

```bash
npm run dev
```

Navigate to `http://localhost:3000` to interact with the streaming workflow interface.

### 5.4 Key Interactions

1. **Input**: Enter a learner advisory query (e.g., "How can I support a 16-year-old interested in robotics but struggling with team collaboration?")
2. **Step 1 Streaming**: Watch learner profile assemble in real-time
3. **Step 2 Streaming**: Observe web search queries and progressive result accumulation
4. **Step 3 Streaming**: See advisory plan sections appear incrementally
5. **Cancellation**: Click "Stop" to abort the workflow mid-execution

The provided UI copy (e.g., Japanese labels for search events) is illustrative; teams are expected to tailor surface text and layout to their target users without altering the underlying streaming contract.
## 6. Technical Notes

### 6.1 API Migration

As of Mastra v0.20.00, `streamVNext()` and `generateVNext()` have been renamed to `stream()` and `generate()` respectively. This codebase will require updates when migrating to the standard APIs:

```diff
- const workflowStream = run.streamVNext({ inputData, closeOnSuspend: true });
+ const workflowStream = run.stream({ inputData, closeOnSuspend: true });
```

See the [Mastra Migration Guide](https://mastra.ai/blog/migration-guide-streaming) for complete migration instructions.

### 6.2 Type Sharing and Validation

- **Shared schemas**: `AdvisorWorkflowResponseSchema`, `DeepResearchResultSchema`, and `LearnerUnderstandingSchema` are authored once under `src/schemas/` and imported by both server and client modules to keep the contract aligned at build time.
- **Runtime validation coverage**: Workflow steps and API responses validate against Zod before data leaves the server. Streamed payloads parsed via `parsePartialJson` are not re-validated on the client today, so malformed data would currently render as-is.
- **Planned follow-up**: Introduce lightweight client-side `safeParse` guards (or fall back UIs) for partial payloads to close the gap and ensure end-to-end type guarantees remain intact even under transport errors.

## 7. Conclusion

This technical study demonstrates a production-viable architecture for streaming multi-agent workflows using Mastra v0.20 and Next.js App Router. Key contributions include:

1. **Streaming protocol design**: NDJSON-based event streaming with step-level granularity
2. **Progressive rendering**: `parsePartialJson` integration for real-time structured output display
3. **Architectural validation**: Empirical demonstration of workflow benefits over single-agent approaches
4. **Schema alignment**: Shared Zod schemas with planned client-side validation to close remaining runtime gaps

The implementation serves as a reference architecture for educational technology systems, customer support automation, and other domains requiring transparent, multi-step AI reasoning with human-in-the-loop oversight.

## References

### Prior Work
1. [Streaming Structured Data with Single Agents (Zenn)](https://zenn.dev/manalink_dev/articles/teacher-search-agent-by-mastra) - Foundational pattern for `parsePartialJson()` integration

### Mastra Documentation
2. [Mastra Workflows Documentation](https://mastra.ai/en/docs/workflows/overview) - Official workflows guide
3. [Mastra vNext Workflows (Blog)](https://mastra.ai/blog/vNext-workflows) - vNext introduction
4. [Mastra Migration Guide: VNext to Standard APIs](https://mastra.ai/blog/migration-guide-streaming) - API migration instructions

### Web Standards
5. [ReadableStream - Web APIs | MDN](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) - Readable stream interface
6. [WritableStream - Web APIs | MDN](https://developer.mozilla.org/en-US/docs/Web/API/WritableStream) - Writable stream interface
7. [ReadableStream.pipeTo() - Web APIs | MDN](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/pipeTo) - Stream piping method

---

**Repository Structure Summary**:
- **Workflow**: `src/mastra/workflows/advisorWorkflow.ts` (3-step DAG)
- **Streaming API**: `src/app/api/counselor-workflow/route.ts` (NDJSON encoder)
- **Frontend**: `src/app/page.tsx` (Progressive renderer)
- **Schemas**: `src/schemas/` (Shared type definitions)

**Code Attribution**: This implementation builds on Mastra's official streaming examples and Vercel's NDJSON streaming patterns. All custom logic related to partial JSON rendering and replace/append semantics is original to this repository.
