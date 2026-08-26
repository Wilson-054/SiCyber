// Save as: utils/Quiz/xxe-simulator.tsx
"use client";

import { useState, useTransition } from "react";
import { attemptXxeFileRead } from "@/../utils/Quiz/xxe-attempts";
import type { XxeFileReadCriteria } from "@/../utils/Quiz/xxe-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

const REASON_MESSAGE: Record<string, string> = {
  no_doctype: "Payload belum punya deklarasi <!DOCTYPE>.",
  no_external_entity: 'Belum ada deklarasi <!ENTITY ... SYSTEM "..."> yang valid.',
  wrong_target_path: "Entity eksternal terdeklarasi, tapi target path-nya belum tepat.",
  entity_not_referenced: "Entity sudah dideklarasikan, tapi belum dipanggil di body XML (&nama;).",
};

export default function XxeSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: XxeFileReadCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  const [payload, setPayload] = useState(
    `<?xml version="1.0"?>\n<data>\n  <name>test</name>\n</data>`
  );
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof attemptXxeFileRead>> | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await attemptXxeFileRead(categoryId, exerciseId, criteria, payload);
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
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">{criteria.app_name} - Import Data XML</h3>
      <p className="mb-3 text-xs text-[#8B949E]">
        Fitur import data menerima file XML dan langsung memprosesnya lewat parser default.
        Target file yang ingin kamu baca: <code className="text-[#F0883E]">{criteria.target_file_path}</code>
      </p>

      <form onSubmit={submit}>
        <textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          spellCheck={false}
          rows={8}
          className="w-full rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 font-mono text-xs text-[#E6EDF3] focus:border-[#F0883E]/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isPending}
          className="mt-3 rounded bg-[#F0883E] px-4 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
        >
          {isPending ? "Memproses..." : "Kirim Payload"}
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

          {lastResult.leakedContent && (
            <pre className="mt-3 overflow-x-auto rounded bg-[#0D1117] p-3 text-xs text-[#F0883E]">
              {lastResult.leakedContent}
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