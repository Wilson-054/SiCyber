// Save as: utils/Quiz/A01/lab3/ssrf-url-import-attempts.ts
"use server";

import { evaluateSsrfUrlImportAttempt, type SsrfUrlImportCriteria } from "./ssrf-url-import-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptSsrfUrlImport(
  categoryId: string,
  exerciseId: string,
  criteria: SsrfUrlImportCriteria,
  urlInput: string
) {
  const evalResult = evaluateSsrfUrlImportAttempt(criteria, urlInput);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}