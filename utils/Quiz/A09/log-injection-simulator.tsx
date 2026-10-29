// Save as: utils/Quiz/A09/lab1/log-injection-simulator.tsx
"use client";

import { useState } from "react";
import { attemptLogInjection } from "./log-injection-attempts";
import type {
  LogInjectionCriteria,
  LogInjectionFailureReason,
} from "./log-injection-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

const FAILURE_HINTS: Record<LogInjectionFailureReason, string> = {
  no_input_entered: "Kolom username masih kosong.",
  no_newline_used:
    "Belum ada baris baru di input kamu. Tekan Enter di dalam kolom ini untuk menyisipkan karakter baris baru (baris kedua akan dibaca sebagai entri log terpisah).",
  forged_entry_format_mismatch:
    "Belum ada baris yang benar-benar meniru bentuk entri log asli: timestamp (mis. 2026-10-17 09:14:05), lalu level seperti INFO/WARNING/ERROR, baru pesan bebas. Isi pesannya boleh apa saja — yang penting bentuknya.",
};

export default function LogInjectionSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: LogInjectionCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  const [username, setUsername] = useState("");
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof attemptLogInjection>> | null>(
    null
  );
  const [isPending, setIsPending] = useState(false);

  const submit = async () => {
    setIsPending(true);
    try {
      const result = await attemptLogInjection(categoryId, exerciseId, criteria, username);
      setLastResult(result);
      if (result.counters) {
        onCountersUpdate(result.counters);
        if (result.counters.reconsiderPrompt) onReconsiderPrompt();
      }
    } finally {
      setIsPending(false);
    }
  };

  const activeFeedback = lastResult
    ? feedbackByOutcome[lastResult.success ? "success" : "failure"]
    : null;

  return (
    <div className="mb-6 rounded-md border border-[#21262D] bg-[#161B22] p-6">
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-[#8B949E]">Simulasi — bukan sistem nyata</p>
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">{criteria.app_name} · Form Login</h3>
      <p className="mb-3 text-xs leading-relaxed text-[#8B949E]">{criteria.feature_context}</p>
      <p className="mb-3 text-xs text-[#8B949E]">
        Endpoint: <code className="text-[#F0883E]">{criteria.endpoint}</code>
      </p>
      <p className="mb-3 text-xs text-[#8B949E]">
        Level log yang dikenali aplikasi ini:{" "}
        <code className="text-[#F0883E]">{criteria.log_levels.join(", ")}</code> — isi pesan setelah level bebas,
        tidak dibatasi kata tertentu.
      </p>

      <label className="mb-1 block text-xs text-[#8B949E]">Username</label>
      <textarea
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        rows={5}
        spellCheck={false}
        placeholder="Isi username di sini — tekan Enter untuk baris baru..."
        className="w-full rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 font-mono text-xs leading-relaxed text-[#E6EDF3] focus:border-[#F0883E]/50 focus:outline-none"
      />

      <div className="mt-2 flex justify-end">
        <button
          onClick={submit}
          disabled={isPending || !username.trim()}
          className="rounded bg-[#F0883E] px-4 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
        >
          {isPending ? "Mengirim…" : "Kirim Form Login"}
        </button>
      </div>

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

          {lastResult.renderedLines && (
            <div className="mt-3 overflow-hidden rounded-md border border-[#21262D]">
              <div className="border-b border-[#21262D] bg-[#21262D] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-[#8B949E]">
                tail -f server.log
              </div>
              <pre className="overflow-x-auto bg-[#0D1117] p-3 font-mono text-xs leading-relaxed">
                {lastResult.renderedLines.map((line, i) => {
                  const isForgedMatch = lastResult.success && i === lastResult.matchedLineIndex;
                  const isOtherForgedLine = i > 0 && !isForgedMatch;
                  return (
                    <div
                      key={i}
                      className={
                        i === 0 ? "text-[#8B949E]" : isForgedMatch ? "text-[#3FB950]" : "text-[#F0883E]"
                      }
                    >
                      {line || " "}
                      {isForgedMatch && (
                        <span className="ml-2 text-[10px] text-[#F85149]">← entri palsu, tidak pernah terjadi</span>
                      )}
                      {isOtherForgedLine && lastResult.success === false && (
                        <span className="ml-2 text-[10px] text-[#8B949E]"> </span>
                      )}
                    </div>
                  );
                })}
              </pre>
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