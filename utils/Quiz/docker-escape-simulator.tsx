// Save as: utils/Quiz/docker-escape-simulator.tsx
"use client";

import { useState, useTransition } from "react";
import { attemptDockerContainerEscape } from "@/../utils/Quiz/docker-escape-attempts";
import type { MisconfigDockerEscapeCriteria } from "@/../utils/Quiz/docker-escape-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

const REASON_MESSAGE: Record<string, string> = {
  invalid_json: "Body yang kamu kirim bukan JSON yang valid.",
  missing_privileged: 'Container belum dibuat privileged. Coba tambahkan field "Privileged": true.',
  missing_host_root_bind:
    'Container sudah privileged, tapi belum ada bind mount ke root filesystem host di field "Binds".',
};

const DEFAULT_BODY = `{
  "Image": "alpine:latest",
  "Cmd": ["sh"],
  "Privileged": false,
  "Binds": []
}`;

export default function DockerEscapeSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: MisconfigDockerEscapeCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  const [body, setBody] = useState(DEFAULT_BODY);
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof attemptDockerContainerEscape>> | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await attemptDockerContainerEscape(categoryId, exerciseId, criteria, body);
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
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-[#8B949E]">Simulasi - bukan sistem nyata</p>
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">{criteria.app_name} - Container Provisioning Proxy</h3>
      <p className="mb-3 text-xs text-[#8B949E]">
        Proxy internal ini meneruskan body JSON kamu ke{" "}
        <code className="text-[#F0883E]">POST /containers/create</code> tanpa validasi apa pun.
        Craft body yang membuat container baru berjalan privileged dan bisa mengakses filesystem host.
      </p>

      <form onSubmit={submit}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          spellCheck={false}
          rows={8}
          className="w-full rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 font-mono text-xs text-[#E6EDF3] focus:border-[#F0883E]/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isPending}
          className="mt-3 rounded bg-[#F0883E] px-4 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
        >
          {isPending ? "Mengirim..." : "Buat Container"}
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
            {lastResult.success
              ? activeFeedback?.notification_message ?? "Berhasil."
              : REASON_MESSAGE[lastResult.reason] ?? "Gagal."}
          </p>
          {lastResult.success && <p className="mt-2 text-[#C9D1D9]">{activeFeedback?.explanation}</p>}

          {lastResult.leakedInfo && (
            <pre className="mt-3 overflow-x-auto rounded bg-[#0D1117] p-3 text-xs text-[#F0883E]">
{Object.entries(lastResult.leakedInfo).map(([k, v]) => `${k}: ${v}`).join("\n")}
            </pre>
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
