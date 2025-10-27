import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { webSearchByOpenAITool } from "@/mastra/tools/webSearchByOpenAITool";

const mainModel = openai("gpt-4.1");

export const researchAgent = new Agent({
  name: 'Research Agent',
  instructions: `You are an expert research agent. Your goal is to research topics thoroughly by following this EXACT process:

  **PHASE 1: Initial Research**
  1. Break down the main topic into 2 specific, focused search queries
  2. For each query, use the webSearchTool to search the web

  **Important Guidelines:**
  - Keep search queries focused and specific - avoid overly general queries
  - Track all completed queries to avoid repetition
  - Only search follow-up questions from the FIRST round of learnings
  - Do NOT create infinite loops by searching follow-up questions from follow-up results

  **Error Handling:**
  - If all searches fail, use your knowledge to provide basic information
  - Always complete the research process even if some searches fail

  Use all the tools available to you systematically and stop after the follow-up phase.
  `,
  model: mainModel,
  tools: {
    // webSearchTool,
    // evaluateResultTool,
    // extractLearningsTool,
    webSearchByOpenAITool,
  },
});

/**
 *   3. Use evaluateResultTool to determine if results are relevant
 *   4. For relevant results, use extractLearningsTool to extract key learnings and follow-up questions
 *
 *   **PHASE 2: Follow-up Research**
 *   1. After completing Phase 1, collect ALL follow-up questions from the extracted learnings
 *   2. Search for each follow-up question using webSearchTool
 *   3. Use evaluateResultTool and extractLearningsTool on these follow-up results
 *   4. **STOP after Phase 2 - do NOT search additional follow-up questions from Phase 2 results**
 */
