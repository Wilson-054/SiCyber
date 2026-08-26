// Save as: utils/Quiz/docker-escape-attempts.ts
"use server";

import {
  evaluateDockerContainerEscape,
  type MisconfigDockerEscapeCriteria,
} from "@/../utils/Quiz/docker-escape-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptDockerContainerEscape(
  categoryId: string,
  exerciseId: string,
  criteria: MisconfigDockerEscapeCriteria,
  rawJsonBody: string
) {
  const evalResult = evaluateDockerContainerEscape(criteria, rawJsonBody);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}
