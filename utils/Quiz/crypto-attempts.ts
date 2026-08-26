// Save as: utils/Quiz/crypto-attempts.ts
"use server";

import { evaluateWeakHashGuess, type CryptoWeakHashCriteria } from "@/../utils/Quiz/crypto-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptWeakHashGuess(
  categoryId: string,
  exerciseId: string,
  criteria: CryptoWeakHashCriteria,
  guessedPassword: string
) {
  const evalResult = evaluateWeakHashGuess(criteria, guessedPassword);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}