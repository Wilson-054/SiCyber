// Save as: utils/Quiz/auth-token-simulator.tsx
"use client";

import { useState, useTransition } from "react";
import { attemptAuthTokenGuess } from "@/../utils/Quiz/auth-attempt";
import type { AuthWeakTokenDbCriteria } from "@/../utils/Quiz/auth-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

export default function AuthTokenSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: AuthWeakTokenDbCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  const [guess, setGuess] = useState("");
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof attemptAuthTokenGuess>> | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await attemptAuthTokenGuess(categoryId, exerciseId, criteria, guess);
      setLastResult(result);
      if (result.counters) {
        onCountersUpdate(result.counters);
        if (result.counters.reconsiderPrompt) onReconsiderPrompt();
      }
    });
  };

  const activeFeedback = lastResult
    ? feedbackByOutcome[lastResult.success ? "success" : "failure"]
    : null;

  return (
    <div className="mb-6 rounded-md border border-[#21262D] bg-[#161B22] p-6">
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-[#8B949E]">Simulasi — bukan sistem nyata</p>
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">{criteria.app_name} · Tebak Session Token</h3>
      <p className="mb-3 text-xs text-[#8B949E]">
        Kamu tahu token session kamu sendiri dibentuk dari userId + role, dikodekan base64, diberi prefix{" "}
        <code className="text-[#F0883E]">{criteria.token_prefix}</code>. Target user ID:{" "}
        <code className="text-[#F0883E]">{criteria.target_user_id}</code>. Coba bangun token untuk user itu.
      </p>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          autoComplete="off"
          placeholder={`${criteria.token_prefix}...`}
          className="flex-1 rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 text-sm text-[#E6EDF3] focus:border-[#F0883E]/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-[#F0883E] px-4 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
        >
          {isPending ? "Memeriksa…" : "Coba Token"}
        </button>
      </form>

      {lastResult && (
        <div
          className={`mt-4 rounded-md border px-4 py-3 text-sm ${
            lastResult.success
              ? "border-[#238636]/40 bg-[#238636]/10 text-[#3FB950]"
              : "border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]"
          }`}
        >
          <p className="font-medium">
            {activeFeedback?.notification_message ?? (lastResult.success ? "Berhasil." : "Gagal.")}
          </p>
          <p className="mt-2 text-[#C9D1D9]">{activeFeedback?.explanation}</p>
          {lastResult.success && activeFeedback?.implementation_notes && (
            <pre className="mt-3 overflow-x-auto rounded bg-[#0D1117] p-3 text-xs text-[#8B949E]">
              {activeFeedback.implementation_notes}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}