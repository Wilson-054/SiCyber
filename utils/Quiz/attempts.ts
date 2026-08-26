// Save as: utils/Quiz/generic-attempt.ts
"use server";

import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function submitAttempt<C, I, R extends { success: boolean }>(
  categoryId: string,
  exerciseId: string,
  evaluator: (criteria: C, input: I) => R,
  criteria: C,
  input: I
) {
  const evalResult = evaluator(criteria, input);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}