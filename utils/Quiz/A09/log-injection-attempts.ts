// Save as: utils/Quiz/A09/lab1/log-injection-attempts.ts
"use server";

import {
  evaluateLogInjectionAttempt,
  type LogInjectionCriteria,
} from "./log-injection-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptLogInjection(
  categoryId: string,
  exerciseId: string,
  criteria: LogInjectionCriteria,
  usernameInput: string
) {
  const evalResult = evaluateLogInjectionAttempt(criteria, usernameInput);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}