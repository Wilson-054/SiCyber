// Save as: utils/Quiz/xxe-attempts.ts
"use server";

import { evaluateXxeFileRead, type XxeFileReadCriteria } from "@/../utils/Quiz/xxe-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptXxeFileRead(
  categoryId: string,
  exerciseId: string,
  criteria: XxeFileReadCriteria,
  payload: string
) {
  const evalResult = evaluateXxeFileRead(criteria, payload);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}