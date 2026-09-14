// Save as: utils/Quiz/A01/lab3/ssrf-url-import-simulator.tsx
"use client";

import { useState, useTransition } from "react";
import { attemptSsrfUrlImport } from "./ssrf-url-import-attempts";
import type { SsrfUrlImportCriteria, SsrfUrlImportFailureReason } from "./ssrf-url-import-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

const FAILURE_HINTS: Record<SsrfUrlImportFailureReason, string> = {
  no_url_entered: "Kolom URL masih kosong.",
  invalid_url: "Itu bukan URL yang valid. Coba format seperti \"localhost\" atau \"http://127.0.0.1\".",
  external_url: "URL itu mengarah ke alamat publik biasa, bukan alamat internal. Coba alamat lain.",
};

export default function SsrfUrlImportSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: SsrfUrlImportCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  const [urlInput, setUrlInput] = useState("");
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof attemptSsrfUrlImport>> | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const result = await attemptSsrfUrlImport(categoryId, exerciseId, criteria, urlInput);
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
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">{criteria.app_name} · {criteria.feature_context}</h3>
      <p className="mb-3 text-xs text-[#8B949E]">
        Server akan mencoba mengunjungi (fetch) URL apapun yang kamu masukkan di sini, persis seperti fitur impor
        gambar sungguhan — tanpa memvalidasi apakah alamat tujuannya memang boleh diakses.
      </p>

      <div className="flex gap-2">
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://contoh.com/gambar.jpg"
          className="flex-1 rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 font-mono text-sm text-[#E6EDF3] focus:border-[#F0883E]/50 focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={isPending || !urlInput.trim()}
          className="rounded bg-[#F0883E] px-4 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
        >
          {isPending ? "Mengambil…" : "Impor dari URL Ini"}
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

          {lastResult.success && lastResult.leakedData && (
            <div className="mt-3 rounded bg-[#0D1117] p-3 font-mono text-xs text-[#8B949E]">
              <p className="mb-1 text-[#F0883E]">Alamat tujuan: {lastResult.matchedHost}</p>
              {Object.entries(lastResult.leakedData).map(([k, v]) => (
                <p key={k}>
                  <span className="text-[#F0883E]">{k}</span>: {v}
                </p>
              ))}
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