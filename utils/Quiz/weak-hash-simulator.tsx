// Save as: utils/Quiz/weak-hash-simulator.tsx
"use client";

import { useState, useTransition } from "react";
import { attemptWeakHashGuess } from "@/../utils/Quiz/crypto-attempts";
import type { CryptoWeakHashCriteria } from "@/../utils/Quiz/crypto-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

export default function WeakHashSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: CryptoWeakHashCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  const [guess, setGuess] = useState("");
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof attemptWeakHashGuess>> | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await attemptWeakHashGuess(categoryId, exerciseId, criteria, guess);
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
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">
        {criteria.app_name} · Pecahkan Hash {criteria.account_label}
      </h3>
      <p className="mb-3 text-xs text-[#8B949E]">
        Database bocor menampilkan hash password ({criteria.algorithm.toUpperCase()}, tanpa salt) untuk {criteria.account_label}:
      </p>
      <code className="mb-4 block break-all rounded bg-[#0D1117] px-3 py-2 text-xs text-[#F0883E]">
        {criteria.target_hash}
      </code>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          autoComplete="off"
          placeholder="Coba tebak password..."
          className="flex-1 rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 text-sm text-[#E6EDF3] focus:border-[#F0883E]/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-[#F0883E] px-4 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
        >
          {isPending ? "Menghitung…" : "Coba"}
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
          {lastResult.computedHash && (
            <p className="mt-3 font-mono text-[11px] text-[#8B949E]">
              Hash dari tebakanmu: <code className="text-[#F0883E]">{lastResult.computedHash}</code>
            </p>
          )}
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