// Save as: utils/Quiz/A07/lab2/session-fixation-login-attempts.ts
"use server";

import {
  evaluateSessionFixationLoginAttempt,
  type SessionFixationLoginAttemptInput,
  type SessionFixationLoginCriteria,
} from "./session-fixation-login-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptSessionFixationLogin(
  categoryId: string,
  exerciseId: string,
  criteria: SessionFixationLoginCriteria,
  input: SessionFixationLoginAttemptInput
) {
  const evalResult = evaluateSessionFixationLoginAttempt(criteria, input);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}