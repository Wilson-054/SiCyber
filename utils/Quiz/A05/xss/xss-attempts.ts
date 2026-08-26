// Save as: utils/Quiz/A05/lab2/stored-xss-attempts.ts
"use server";

import {
  evaluateStoredXssAttempt,
  type StoredXssCriteria,
} from "@/../utils/Quiz/A05/xss/xss-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptStoredXssInjection(
  categoryId: string,
  exerciseId: string,
  criteria: StoredXssCriteria,
  comment: string
) {
  const evalResult = evaluateStoredXssAttempt(criteria, comment);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}