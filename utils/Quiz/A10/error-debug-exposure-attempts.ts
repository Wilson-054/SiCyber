// Save as: utils/Quiz/A10/lab1/error-debug-exposure-attempts.ts
"use server";

import {
  evaluateErrorDebugExposure,
  type ErrorDebugExposureCriteria,
  type ErrorDebugExposureAttempt,
} from "@/../utils/Quiz/A10/error-debug-exposure-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptErrorDebugExposure(
  categoryId: string,
  exerciseId: string,
  criteria: ErrorDebugExposureCriteria,
  attempt: ErrorDebugExposureAttempt
) {
  const evalResult = evaluateErrorDebugExposure(criteria, attempt);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}
