import { Mastra } from "@mastra/core";
import { clearAITracingRegistry } from "@mastra/core/ai-tracing";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";

import { researchAgent } from "./agents/researchAgent";
import { userUnderstandingAgent } from "./agents/userUnderstandingAgent";
import { advisorSynthesisAgent } from "./agents/advisorSynthesisAgent";
import { counselorWorkflow } from "./workflows/counselorWorkflow";

function createMastraInstance() {
  try {
    clearAITracingRegistry();
  } catch (error) {
    console.warn("Failed to clear AI tracing registry", error);
  }
  return new Mastra({
    agents: {
      researchAgent,
      userUnderstandingAgent,
      advisorSynthesisAgent,
    },
    workflows: {
      counselorWorkflow,
    },
    storage: new LibSQLStore({
      // stores observability, scores, ... into memory storage, if it needs to persist, change to file:../mastra.db
      url: "file:../mastra.db",
    }),
    logger: new PinoLogger({
      name: "Mastra",
      level: "info",
    }),
    telemetry: {
      enabled: false,
    },
  });
}

const globalForMastra = globalThis as unknown as { __mastraInstance?: ReturnType<typeof createMastraInstance> };

export const mastra = globalForMastra.__mastraInstance ?? (globalForMastra.__mastraInstance = createMastraInstance());
