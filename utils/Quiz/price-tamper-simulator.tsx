// Save as: utils/Quiz/price-tamper-simulator.tsx
"use client";

import { useState, useTransition } from "react";
import { attemptPriceTamper } from "@/../utils/Quiz/insecure-design-attempts";
import type { InsecureDesignPriceCriteria } from "@/../utils/Quiz/insecure-design-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

export default function PriceTamperSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: InsecureDesignPriceCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  const [quantity, setQuantity] = useState("1");
  const [claimedTotal, setClaimedTotal] = useState(String(criteria.unit_price));
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof attemptPriceTamper>> | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await attemptPriceTamper(
        categoryId,
        exerciseId,
        criteria,
        Number(quantity),
        Number(claimedTotal)
      );
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
        {criteria.app_name} · Checkout {criteria.product_name}
      </h3>
      <p className="mb-3 text-xs text-[#8B949E]">
        Harga satuan: <span className="text-[#E6EDF3]">Rp{criteria.unit_price.toLocaleString("id-ID")}</span>. Form
        checkout ini mengirim field <code className="text-[#F0883E]">total</code> langsung dari form — server
        mempercayainya apa adanya.
      </p>

      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-[#8B949E]">Jumlah (quantity)</label>
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            type="text"
            inputMode="numeric"
            className="w-full rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 text-sm text-[#E6EDF3] focus:border-[#F0883E]/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[#8B949E]">Total (dikirim dari klien)</label>
          <input
            value={claimedTotal}
            onChange={(e) => setClaimedTotal(e.target.value)}
            type="text"
            inputMode="numeric"
            className="w-full rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 text-sm text-[#E6EDF3] focus:border-[#F0883E]/50 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="col-span-2 rounded bg-[#F0883E] px-4 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
        >
          {isPending ? "Memproses…" : "Checkout"}
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
          {lastResult.correctTotal !== undefined && (
            <p className="mt-2 font-mono text-[11px] text-[#8B949E]">
              Total seharusnya: Rp{lastResult.correctTotal.toLocaleString("id-ID")} · Total yang diproses server: Rp
              {lastResult.claimedTotal?.toLocaleString("id-ID")}
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