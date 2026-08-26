// Save as: utils/Quiz/A05/lab2/stored-xss-simulator.tsx
"use client";

import { useState, useTransition } from "react";
import { attemptStoredXssInjection } from "@/../utils/Quiz/A05/xss/xss-attempts";
import type {
  StoredXssCriteria,
  StoredXssFailureReason,
} from "@/../utils/Quiz/A05/xss/xss-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

const FAILURE_HINTS: Record<StoredXssFailureReason, string> = {
  no_payload: "Kolom komentar masih kosong. Coba sisipkan tag HTML dengan atribut event handler.",
  script_tag_ignored:
    "Kamu mengirim tag <script>, tapi browser modern tidak mengeksekusi tag <script> yang disisipkan lewat innerHTML. Coba cara lain yang memicu eksekusi lewat atribut event, bukan lewat tag <script> langsung.",
  no_match:
    "Komentar ini akan ditampilkan apa adanya sebagai teks/HTML biasa, tapi belum ada bagian yang benar-benar memicu eksekusi JavaScript.",
};

export default function StoredXssSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: StoredXssCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  const [comment, setComment] = useState("");
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof attemptStoredXssInjection>> | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const result = await attemptStoredXssInjection(categoryId, exerciseId, criteria, comment);
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
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">{criteria.app_name} · Kolom Komentar</h3>
      <p className="mb-3 text-xs text-[#8B949E]">
        Komentar ini akan disimpan dan ditampilkan ke pengguna lain lewat{" "}
        <code className="text-[#F0883E]">{criteria.vulnerable_sink}</code> tanpa encoding.
      </p>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        className="w-full rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 font-mono text-xs text-[#C9D1D9] focus:border-[#F0883E]/50 focus:outline-none"
        placeholder="Tulis komentar..."
      />

      <button
        onClick={submit}
        disabled={isPending || !comment.trim()}
        className="mt-3 rounded bg-[#F0883E] px-4 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
      >
        {isPending ? "Mengirim…" : "Kirim Komentar"}
      </button>

      {lastResult && (
        <div
          className={`mt-4 rounded-md border px-4 py-3 text-sm ${
            lastResult.success
              ? "border-[#238636]/40 bg-[#238636]/10 text-[#3FB950]"
              : "border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]"
          }`}
        >
          <p className="font-medium">
            {activeFeedback?.notification_message ?? (lastResult.success ? "Berhasil." : "Belum berhasil.")}
          </p>
          <p className="mt-2 text-[#C9D1D9]">{activeFeedback?.explanation}</p>

          {!lastResult.success && lastResult.reason !== "ok" && (
            <div className="mt-3 rounded bg-[#0D1117] p-3 text-xs text-[#8B949E]">
              {FAILURE_HINTS[lastResult.reason]}
            </div>
          )}

          {lastResult.success && activeFeedback?.implementation_notes && (
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded bg-[#0D1117] p-3 text-xs text-[#8B949E]">
              {activeFeedback.implementation_notes}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}