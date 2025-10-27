import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";

import { advisorUnderstandingInstructions } from "./instructions/advisorAgentInstructions";
import { getClientProfileTool } from "../tools/getClientProfileTool";
import { getLearningMilestonesTool } from "../tools/getLearningMilestonesTool";
import { getSupportInteractionHistoryTool } from "../tools/getSupportInteractionHistoryTool";
import { getPerformanceReportsTool } from "../tools/getPerformanceReportsTool";

export const userUnderstandingAgent = new Agent({
  name: "Learner Understanding Agent",
  instructions: advisorUnderstandingInstructions,
  model: openai("gpt-4.1"),
  tools: {
    getClientProfileTool,
    getLearningMilestonesTool,
    getSupportInteractionHistoryTool,
    getPerformanceReportsTool,
  },
  defaultGenerateOptions: {
    maxSteps: 30,
  },
});
