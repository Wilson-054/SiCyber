// Save as: utils/Quiz/A06/lab1/file-upload-attempts.ts
"use server";

import {
  evaluateFileUploadAttempt,
  type UnrestrictedFileUploadCriteria,
} from "./file-upload-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptFileUpload(
  categoryId: string,
  exerciseId: string,
  criteria: UnrestrictedFileUploadCriteria,
  filenameInput: string
) {
  const evalResult = evaluateFileUploadAttempt(criteria, filenameInput);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}