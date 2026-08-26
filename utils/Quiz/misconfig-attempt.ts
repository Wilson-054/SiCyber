// Save as: utils/Quiz/misconfig-attempts.ts
"use server";

import { evaluateMisconfigDebugAccess, type MisconfigDebugCriteria } from "@/../utils/Quiz/misconfig-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptMisconfigDebugAccess(
  categoryId: string,
  exerciseId: string,
  criteria: MisconfigDebugCriteria,
  requestedPath: string
) {
  const evalResult = evaluateMisconfigDebugAccess(criteria, requestedPath);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}   