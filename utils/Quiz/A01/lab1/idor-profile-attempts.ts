// Save as: utils/Quiz/A01/lab1/idor-profile-attempts.ts
"use server";

import { evaluateIdorProfileAttempt, type IdorProfileCriteria } from "./idor-profile-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptIdorProfileAccess(
  categoryId: string,
  exerciseId: string,
  criteria: IdorProfileCriteria,
  requestedIdInput: string
) {
  const evalResult = evaluateIdorProfileAttempt(criteria, requestedIdInput);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}