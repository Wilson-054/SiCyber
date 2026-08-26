// Save as: utils/Quiz/race-condition-lab.tsx (replace)
"use client";

import { useState, useTransition } from "react";
import { markRaceLabDemonstrated } from "./race-lab-actions";

type RaceConditionLabCriteria = {
  type: "race_condition_lab";
  app_name: string;
  scenario_label: string;
  default_starting_balance: number;
  default_withdrawal_amount: number;
};

type RaceRunState = {
  id: string;
  mode: "vulnerable" | "fixed";
  withdrawal_amount: number;
  balance: number;
  successful_withdrawals: number;
};

type RequestLogEntry = { index: number; success: boolean; balanceAfter?: number };

export default function RaceConditionLab({
  categoryId,
  exerciseId,
  criteria,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: RaceConditionLabCriteria;
}) {
  const [mode, setMode] = useState<"vulnerable" | "fixed">("vulnerable");
  const [startingBalance, setStartingBalance] = useState(String(criteria.default_starting_balance));
  const [withdrawalAmount, setWithdrawalAmount] = useState(String(criteria.default_withdrawal_amount));
  const [concurrency, setConcurrency] = useState("5");
  const [delayMs, setDelayMs] = useState("400");

  const [run, setRun] = useState<RaceRunState | null>(null);
  const [log, setLog] = useState<RequestLogEntry[]>([]);
  const [demonstrated, setDemonstrated] = useState(false);
  const [isPending, startTransition] = useTransition();

  const startNewRun = () => {
    startTransition(async () => {
      const res = await fetch("/api/race-lab/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          exerciseId,
          mode,
          startingBalance: Number(startingBalance),
          withdrawalAmount: Number(withdrawalAmount),
        }),
      });
      const newRun = await res.json();
      setRun(newRun);
      setLog([]);
    });
  };

  const fireBurst = () => {
    if (!run) return;
    const n = Math.min(Math.max(Number(concurrency), 1), 20);

    startTransition(async () => {
      // fetch() ke API Route langsung — mekanisme yang sudah terbukti
      // mendukung concurrency sungguhan, beda dari Server Action.
      const results = await Promise.all(
        Array.from({ length: n }, (_, i) =>
          fetch("/api/race-lab/withdraw", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({ runId: run.id, mode, delayMs: Number(delayMs) }),
          }).then((r) => r.json())
        )
      );

      const entries: RequestLogEntry[] = results.map((r, i) => ({
        index: i + 1,
        success: r.success,
        balanceAfter: r.balanceAfter,
      }));
      setLog(entries);

      const stateRes = await fetch(`/api/race-lab/state?runId=${run.id}`, { cache: "no-store" });
      const finalState = await stateRes.json();
      setRun(finalState);

      const successCount = entries.filter((e) => e.success).length;
      if (mode === "vulnerable" && successCount > 1 && !demonstrated) {
        setDemonstrated(true);
        await markRaceLabDemonstrated(categoryId, exerciseId);
      }
    });
  };

  const successCount = log.filter((e) => e.success).length;

  return (
    <div className="mb-6 rounded-md border border-[#21262D] bg-[#161B22] p-6">
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-[#8B949E]">
        Lab interaktif — eksperimen bebas, tidak ada jawaban tunggal yang "benar"
      </p>
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">
        {criteria.app_name} · {criteria.scenario_label}
      </h3>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs text-[#8B949E]">Mode</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "vulnerable" | "fixed")}
            className="w-full rounded border border-[#21262D] bg-[#0D1117] px-2 py-2 text-sm text-[#E6EDF3]"
          >
            <option value="vulnerable">Vulnerable (check-then-act)</option>
            <option value="fixed">Fixed (atomic update)</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-[#8B949E]">Saldo awal</label>
          <input
            value={startingBalance}
            onChange={(e) => setStartingBalance(e.target.value)}
            className="w-full rounded border border-[#21262D] bg-[#0D1117] px-2 py-2 text-sm text-[#E6EDF3]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[#8B949E]">Nilai per penarikan</label>
          <input
            value={withdrawalAmount}
            onChange={(e) => setWithdrawalAmount(e.target.value)}
            className="w-full rounded border border-[#21262D] bg-[#0D1117] px-2 py-2 text-sm text-[#E6EDF3]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[#8B949E]">Delay buatan (ms)</label>
          <input
            value={delayMs}
            onChange={(e) => setDelayMs(e.target.value)}
            className="w-full rounded border border-[#21262D] bg-[#0D1117] px-2 py-2 text-sm text-[#E6EDF3]"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <button
          onClick={startNewRun}
          disabled={isPending}
          className="rounded border border-[#21262D] px-4 py-2 text-sm text-[#E6EDF3] hover:border-[#F0883E]/50 disabled:opacity-50"
        >
          Mulai run baru
        </button>

        <div>
          <label className="mb-1 block text-xs text-[#8B949E]">Jumlah request paralel</label>
          <input
            value={concurrency}
            onChange={(e) => setConcurrency(e.target.value)}
            className="w-24 rounded border border-[#21262D] bg-[#0D1117] px-2 py-2 text-sm text-[#E6EDF3]"
          />
        </div>

        <button
          onClick={fireBurst}
          disabled={isPending || !run}
          className="rounded bg-[#F0883E] px-4 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
        >
          {isPending ? "Menembak…" : "Tembak semua sekaligus"}
        </button>
      </div>

      {!run && <p className="text-sm text-[#8B949E]">Mulai run baru untuk mengatur saldo awal sebelum menembak.</p>}

      {run && (
        <div className="mb-4 rounded bg-[#0D1117] p-4 font-mono text-xs text-[#8B949E]">
          <p>
            Run aktif ({run.mode}) · Saldo saat ini:{" "}
            <span className="text-[#E6EDF3]">Rp{run.balance.toLocaleString("id-ID")}</span> · Total penarikan
            berhasil: <span className="text-[#E6EDF3]">{run.successful_withdrawals}</span>
          </p>
        </div>
      )}

      {log.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[#8B949E]">
                <th className="pb-2 pr-4">#</th>
                <th className="pb-2 pr-4">Hasil</th>
                <th className="pb-2">Saldo setelahnya (dari perspektif request ini)</th>
              </tr>
            </thead>
            <tbody>
              {log.map((entry) => (
                <tr key={entry.index} className="border-t border-[#21262D]">
                  <td className="py-1.5 pr-4 text-[#8B949E]">{entry.index}</td>
                  <td className={`py-1.5 pr-4 ${entry.success ? "text-[#3FB950]" : "text-[#F85149]"}`}>
                    {entry.success ? "Berhasil" : "Ditolak"}
                  </td>
                  <td className="py-1.5 text-[#8B949E]">
                    {entry.balanceAfter !== undefined ? `Rp${entry.balanceAfter.toLocaleString("id-ID")}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className={`mt-3 text-sm ${successCount > 1 ? "text-[#F0883E]" : "text-[#C9D1D9]"}`}>
            {successCount} dari {log.length} request berhasil menarik dana.{" "}
            {successCount > 1
              ? mode === "vulnerable"
                ? "Race condition berhasil dieksploitasi — lebih dari satu penarikan lolos padahal saldo cuma cukup untuk satu."
                : ""
              : "Cuma satu yang lolos, sesuai perilaku yang diharapkan."}
          </p>
        </div>
      )}

      {demonstrated && (
        <div className="rounded-md border border-[#238636]/40 bg-[#238636]/10 px-4 py-3 text-sm text-[#3FB950]">
          Kamu sudah berhasil mendemonstrasikan race condition di mode vulnerable. Coba ulangi dengan mode "Fixed"
          untuk melihat bagaimana atomic update mencegahnya — pakai saldo & delay yang sama biar perbandingannya adil.
        </div>
      )}
    </div>
  );
}