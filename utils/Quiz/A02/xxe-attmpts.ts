// Save as: utils/Quiz/A02/xxe/xxe-attempts.ts
"use server";

import { evaluateXxeAttempt, type XxeLocalFileReadCriteria } from "./xxe-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptXxeLocalFileRead(
  categoryId: string,
  exerciseId: string,
  criteria: XxeLocalFileReadCriteria,
  xmlInput: string
) {
  const evalResult = evaluateXxeAttempt(criteria, xmlInput);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}