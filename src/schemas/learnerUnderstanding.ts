import { z } from "zod";

import { LearnerUnderstandingSchema } from "@/mastra/workflows/advisorWorkflow";

export type LearnerUnderstanding = z.infer<typeof LearnerUnderstandingSchema>;
