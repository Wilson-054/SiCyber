// Save as: utils/Quiz/A02/lab1/cookie-theft-attempts.ts
"use server";

import {
  evaluateCookieTheftAttempt,
  type CookieTheftCriteria,
} from "./cookie-theft-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptCookieTheft(
  categoryId: string,
  exerciseId: string,
  criteria: CookieTheftCriteria,
  payload: string
) {
  const evalResult = evaluateCookieTheftAttempt(criteria, payload);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}