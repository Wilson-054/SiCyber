// Save as: app/components/Exercise/SqliLoginSimulator.tsx
"use client";

import { useState, useTransition } from "react";
import { attemptSqliLogin } from "./sqli-attempts";
import type { SqliLoginCriteria } from "./sqli-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

export default function SqliLoginSimulator({
  categoryId,
  exerciseId,
  scenarioConfig,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  scenarioConfig: { app_name?: string; login_label?: string };
  criteria: SqliLoginCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [lastResult, setLastResult] = useState<null | { success: boolean; builtQuery: string }>(null);
  const [isPending, startTransition] = useTransition();

  const appName = scenarioConfig.app_name ?? "Aplikasi Simulasi";
  const loginLabel = scenarioConfig.login_label ?? "Login";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await attemptSqliLogin(categoryId, exerciseId, criteria, username, password);
      setLastResult(result);
      if (result.counters) {
        onCountersUpdate(result.counters);
        if (result.counters.reconsiderPrompt) onReconsiderPrompt();
      }
    });
  };

  const activeFeedback = lastResult ? feedbackByOutcome[lastResult.success ? "success" : "failure"] : null;

  return (
    <div className="mb-6 rounded-md border border-[#21262D] bg-[#161B22] p-6">
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-[#8B949E]">Simulasi — bukan sistem nyata</p>
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">
        {appName} · {loginLabel}
      </h3>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-[#8B949E]">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            className="w-full rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 text-sm text-[#E6EDF3] focus:border-[#F0883E]/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[#8B949E]">Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            className="w-full rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 text-sm text-[#E6EDF3] focus:border-[#F0883E]/50 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-[#F0883E] px-4 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
        >
          {isPending ? "Memeriksa…" : "M    asuk"}
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
          <p className="mt-3 font-mono text-[11px] text-[#8B949E]">
            Query rentan yang terbentuk: <code className="text-[#F0883E]">{lastResult.builtQuery}</code>
          </p>
        </div>
      )}
    </div>
  );
}