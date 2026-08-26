// Save as: utils/Quiz/A02/lab1/cookie-theft-simulator.tsx
"use client";

import { useState, useTransition } from "react";
import { attemptCookieTheft } from "./cookie-theft-attempts";
import type {
  CookieTheftCriteria,
  CookieTheftFailureReason,
} from "./cookie-theft-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

const FAILURE_HINTS: Record<CookieTheftFailureReason, string> = {
  no_payload: "Kolom komentar masih kosong.",
  script_tag_ignored:
    "Tag <script> tidak akan tereksekusi lewat cara komentar ini ditampilkan. Coba pakai tag dengan atribut event handler seperti onerror.",
  no_cookie_read:
    "Payload-mu belum benar-benar membaca document.cookie. Skrip yang kamu sisipkan perlu mengakses nilai cookie itu supaya bisa 'dicuri'.",
  httponly_present: "Cookie ini sudah dilindungi HttpOnly, jadi tidak bisa dibaca lewat JavaScript.",
};

export default function CookieTheftSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: CookieTheftCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  const [payload, setPayload] = useState("");
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof attemptCookieTheft>> | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const result = await attemptCookieTheft(categoryId, exerciseId, criteria, payload);
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
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">{criteria.app_name} · {criteria.vulnerable_feature}</h3>
      <p className="mb-3 text-xs text-[#8B949E]">
        Cookie <code className="text-[#F0883E]">{criteria.cookie_name}</code> tidak menyertakan atribut HttpOnly.
        Sisipkan komentar yang bisa membaca dan "mencuri" nilai cookie tersebut.
      </p>

      <textarea
        value={payload}
        onChange={(e) => setPayload(e.target.value)}
        rows={3}
        className="w-full rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 font-mono text-xs text-[#C9D1D9] focus:border-[#F0883E]/50 focus:outline-none"
        placeholder="Tulis komentar..."
      />

      <button
        onClick={submit}
        disabled={isPending || !payload.trim()}
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

          {lastResult.success && lastResult.stolenCookiePreview && (
            <p className="mt-3 font-mono text-xs text-[#8B949E]">
              Cookie tercuri (simulasi): <span className="text-[#F0883E]">{lastResult.stolenCookiePreview}</span>
            </p>
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