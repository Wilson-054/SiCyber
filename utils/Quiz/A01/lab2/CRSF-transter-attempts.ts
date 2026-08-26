// Save as: utils/Quiz/A01/lab3/csrf-transfer-attempts.ts
"use server";

import { evaluateCsrfTransferAttempt, type CsrfTransferCriteria } from "./CRSF-transfer-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptCsrfTransfer(
  categoryId: string,
  exerciseId: string,
  criteria: CsrfTransferCriteria,
  payload: string
) {
  const evalResult = evaluateCsrfTransferAttempt(criteria, payload);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}