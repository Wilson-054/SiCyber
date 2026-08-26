// Save as: utils/Quiz/A07/lab1/session-fixation-attempts.ts
"use server";

import {
  evaluateSessionFixationAttempt,
  computeVictimSessionAfterLogin,
  type SessionFixationCriteria,
} from "@/../utils/Quiz/A07/session-fixation-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

// Menghitung session ID korban setelah login. Dipanggil terpisah dari
// attemptSessionFixationHijack supaya UI bisa menampilkan cookie
// korban ke user SEBELUM user menyatakan kesimpulan (user harus
// mengamati nilai ini sendiri, bukan ditebak).
export async function simulateVictimLogin(criteria: SessionFixationCriteria, attackerSessionIdSet: string) {
  return { victimSessionIdAfterLogin: computeVictimSessionAfterLogin(criteria, attackerSessionIdSet) };
}

export async function attemptSessionFixationHijack(
  categoryId: string,
  exerciseId: string,
  criteria: SessionFixationCriteria,
  input: {
    attackerSessionIdSet: string;
    victimLoggedIn: boolean;
    victimSessionIdAfterLogin: string;
    userConclusion: "same" | "different" | null;
    attackerCheckSessionId: string;
  }
) {
  const evalResult = evaluateSessionFixationAttempt(criteria, input);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}