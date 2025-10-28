import { z } from "zod";

import { LearnerUnderstandingSchema } from "mastra/workflows/counselorWorkflow";

export type LearnerUnderstanding = z.infer<typeof LearnerUnderstandingSchema>;
