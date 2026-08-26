// Save as: utils/Quiz/insecure-design-attempts.ts
"use server";

import { evaluatePriceTamperAttempt, type InsecureDesignPriceCriteria } from "@/../utils/Quiz/insecure-design-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptPriceTamper(
  categoryId: string,
  exerciseId: string,
  criteria: InsecureDesignPriceCriteria,
  quantity: number,
  claimedTotal: number
) {
  const evalResult = evaluatePriceTamperAttempt(criteria, quantity, claimedTotal);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}   