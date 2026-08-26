// Save as: utils/Quiz/xxe-blind-simulator.tsx
"use client";

import { useState, useTransition } from "react";
import { attemptXxeBlindExfil } from "@/../utils/Quiz/xxe-blind-attempts";
import type { XxeBlindExfilCriteria } from "@/../utils/Quiz/xxe-blind-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

const REASON_MESSAGE: Record<string, string> = {
  missing_file_entity: 'Belum ada parameter entity yang membaca file, contoh: <!ENTITY % file SYSTEM "...">',
  wrong_target_path: "Parameter entity %file sudah ada, tapi path target-nya belum tepat.",
  missing_eval_entity:
    'Butuh entity perantara %eval yang di dalamnya mendeklarasikan %exfil, karena parameter entity tidak bisa langsung memakai general entity.',
  missing_attacker_domain: "Entity %exfil sudah ada, tapi belum mengarah ke domain attacker yang benar.",
  missing_file_reference: "URL exfiltration belum menyertakan %file; supaya isi file ikut terkirim.",
  missing_trigger: "Entity sudah dideklarasikan, tapi %eval; dan %exfil; belum benar-benar dipanggil di payload.",
  wrong_trigger_order: "%eval; harus dipanggil sebelum %exfil;, supaya entity %exfil sudah terdefinisi saat dipanggil.",
};

const DEFAULT_PAYLOAD = `<?xml version="1.0"?>
<!DOCTYPE data [
  <!ENTITY % file SYSTEM "">
  <!ENTITY % eval "">
]>
<data>test</data>`;

export default function XxeBlindSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: XxeBlindExfilCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof attemptXxeBlindExfil>> | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await attemptXxeBlindExfil(categoryId, exerciseId, criteria, payload);
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
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">{criteria.app_name} - Blind XXE</h3>
      <p className="mb-3 text-xs text-[#8B949E]">
        Endpoint ini memproses XML tapi tidak pernah menampilkan isi file apa pun di response, jadi kamu tidak
        bisa mengandalkan in-band read. Target file: <code className="text-[#F0883E]">{criteria.target_file_path}</code>.
        Kamu mengontrol server di <code className="text-[#F0883E]">{criteria.attacker_domain}</code> untuk menangkap
        data yang keluar.
      </p>

      <form onSubmit={submit}>
        <textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          spellCheck={false}
          rows={10}
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

          {lastResult.simulatedOobLog && (
            <div className="mt-3">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[#8B949E]">
                Log server attacker (simulasi)
              </p>
              <pre className="overflow-x-auto rounded bg-[#0D1117] p-3 text-xs text-[#F0883E]">
                {lastResult.simulatedOobLog}
              </pre>
            </div>
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
