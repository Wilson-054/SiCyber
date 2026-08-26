// Save as: utils/Quiz/docker-socket-attempts.ts
"use server";

import {
  evaluateDockerSocketAccess,
  type MisconfigDockerSocketCriteria,
} from "@/../utils/Quiz/docker-socket-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptDockerSocketAccess(
  categoryId: string,
  exerciseId: string,
  criteria: MisconfigDockerSocketCriteria,
  requestedPath: string
) {
  const evalResult = evaluateDockerSocketAccess(criteria, requestedPath);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}