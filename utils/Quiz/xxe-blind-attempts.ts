// Save as: utils/Quiz/xxe-blind-attempts.ts
"use server";

import { evaluateXxeBlindExfil, type XxeBlindExfilCriteria } from "@/../utils/Quiz/xxe-blind-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptXxeBlindExfil(
  categoryId: string,
  exerciseId: string,
  criteria: XxeBlindExfilCriteria,
  payload: string
) {
  const evalResult = evaluateXxeBlindExfil(criteria, payload);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}
