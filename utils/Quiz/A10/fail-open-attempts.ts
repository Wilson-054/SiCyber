// Save as: utils/Quiz/A10/lab1/fail-open-attempts.ts
"use server";

import {
  evaluateFailOpenAttempt,
  type FailOpenAuthzCriteria,
} from "./fail-open-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptFailOpenAccess(
  categoryId: string,
  exerciseId: string,
  criteria: FailOpenAuthzCriteria,
  documentIdInput: string
) {
  const evalResult = evaluateFailOpenAttempt(criteria, documentIdInput);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}