// Save as: lib/exercise-config.ts

export const HINT_THRESHOLD = 2;
export const CONSECUTIVE_FAILURE_THRESHOLD = 3;

export function shouldShowReconsiderPrompt(hintsUsed: number, consecutiveFailures: number) {
  return hintsUsed >= HINT_THRESHOLD || consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD;
}