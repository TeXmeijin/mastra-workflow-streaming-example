import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";

import { advisorSynthesisInstructions } from "./instructions/advisorAgentInstructions";

export const advisorSynthesisAgent = new Agent({
  name: "Learner Advisory Synthesis Agent",
  instructions: advisorSynthesisInstructions,
  model: openai("gpt-4.1"),
  defaultGenerateOptions: {
    maxSteps: 20,
  },
});
