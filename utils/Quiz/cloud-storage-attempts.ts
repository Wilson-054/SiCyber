// Save as: utils/Quiz/cloud-storage-attempts.ts
"use server";

import {
  evaluateOpenBucketAccess,
  type MisconfigOpenBucketCriteria,
} from "@/../utils/Quiz/cloud-storage-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptOpenBucketAccess(
  categoryId: string,
  exerciseId: string,
  criteria: MisconfigOpenBucketCriteria,
  requestedBucket: string
) {
  const evalResult = evaluateOpenBucketAccess(criteria, requestedBucket);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}