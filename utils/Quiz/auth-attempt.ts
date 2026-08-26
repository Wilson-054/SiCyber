// Save as: utils/Quiz/auth-attempts.ts
"use server";

import { evaluateAuthTokenGuess, type AuthWeakTokenDbCriteria } from "@/../utils/Quiz/auth-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptAuthTokenGuess(
  categoryId: string,
  exerciseId: string,
  criteria: AuthWeakTokenDbCriteria,
  guessedToken: string
) {
  const evalResult = evaluateAuthTokenGuess(criteria, guessedToken);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}