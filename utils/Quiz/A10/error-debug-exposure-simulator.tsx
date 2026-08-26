// Save as: components/quiz/A10/lab1/ErrorDebugExposureSimulator.tsx
"use client";

import { useState } from "react";
import {
  type ErrorDebugExposureCriteria,
  type ErrorDebugExposureResult,
} from "@/../utils/Quiz/A10/error-debug-exposure-evaluator";
import { attemptErrorDebugExposure } from "@/../utils/Quiz/A10/error-debug-exposure-attempts";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type FeedbackRow = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string | null;
  implementation_notes: string | null;
};

type Props = {
  categoryId: string;
  exerciseId: string;
  criteria: ErrorDebugExposureCriteria;
  feedbackByOutcome: {
    success?: FeedbackRow;
    failure?: FeedbackRow;
  };
  // dipanggil setelah submit supaya komponen induk (ExerciseWorkspace)
  // bisa sinkronkan hints_used/attempts_count di header, kalau memang
  // dikelola di level induk
  onCountersUpdate?: (counters: ProgressCounters) => void;
};

type AttemptResponse = ErrorDebugExposureResult & { counters: ProgressCounters };

export default function ErrorDebugExposureSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
}: Props) {
  const [errorTriggered, setErrorTriggered] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [selectedDetailIds, setSelectedDetailIds] = useState<string[]>([]);
  const [endpointGuess, setEndpointGuess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [debugConsoleUnlocked, setDebugConsoleUnlocked] = useState(false);

  function toggleDetail(id: string) {
    setSelectedDetailIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  async function handleTrigger() {
    // input apapun yang dikirim akan tetap memicu error yang sama -
    // simulasi ini tidak mengevaluasi isi searchInput, cukup memicu
    // tampilnya pesan error mentah
    setErrorTriggered(true);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = (await attemptErrorDebugExposure(categoryId, exerciseId, criteria, {
        selectedDetailIds,
        debugEndpointGuess: endpointGuess,
      })) as AttemptResponse;
      setResult(res);
      onCountersUpdate?.(res.counters);
      if (res.success) setDebugConsoleUnlocked(true);
    } finally {
      setSubmitting(false);
    }
  }

  const feedback = result
    ? result.success
      ? feedbackByOutcome.success
      : feedbackByOutcome.failure
    : null;

  return (
    <div className="space-y-6">
      {/* Panel simulasi endpoint pencarian pegawai */}
      <section className="rounded-md border border-[#21262D] bg-[#161B22] p-4">
        <p className="mb-3 font-mono text-xs uppercase tracking-wider text-[#8B949E]">
          {criteria.app_name} &middot; {criteria.trigger_endpoint}
        </p>

        {!errorTriggered ? (
          <div className="flex items-center gap-3">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Masukkan ID pegawai (coba nilai yang tidak wajar...)"
              className="flex-1 rounded border border-[#30363D] bg-[#0D1117] px-3 py-2 text-sm text-[#E6EDF3] placeholder:text-[#6E7681] focus:border-[#F0883E] focus:outline-none"
            />
            <button
              onClick={handleTrigger}
              className="rounded bg-[#F0883E] px-4 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90"
            >
              Cari
            </button>
          </div>
        ) : (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-[#F85149]/40 bg-[#0D1117] p-3 font-mono text-xs leading-relaxed text-[#F85149]">
            {criteria.raw_error_message}
          </pre>
        )}
      </section>

      {errorTriggered && (
        <>
          {/* Tahap 1: identifikasi info yang bocor */}
          <section className="rounded-md border border-[#21262D] bg-[#161B22] p-4">
            <h3 className="mb-1 text-sm font-semibold text-[#E6EDF3]">
              Tahap 1 &middot; Informasi apa saja pada pesan error di atas yang tergolong
              bocor/sensitif?
            </h3>
            <p className="mb-3 text-xs text-[#8B949E]">
              Pilih semua yang menurutmu seharusnya tidak pernah ikut ditampilkan ke pengguna.
              Tidak semua baris di atas berbahaya, sebagian cuma info teknis biasa.
            </p>
            <div className="space-y-2">
              {criteria.leaked_error_details.map((detail) => (
                <label
                  key={detail.id}
                  className="flex cursor-pointer items-start gap-2 rounded border border-[#21262D] px-3 py-2 text-sm hover:border-[#30363D]"
                >
                  <input
                    type="checkbox"
                    checked={selectedDetailIds.includes(detail.id)}
                    onChange={() => toggleDetail(detail.id)}
                    className="mt-0.5"
                  />
                  <span className="text-[#C9D1D9]">{detail.label}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Tahap 2: tebak endpoint debug */}
          <section className="rounded-md border border-[#21262D] bg-[#161B22] p-4">
            <h3 className="mb-1 text-sm font-semibold text-[#E6EDF3]">
              Tahap 2 &middot; Berdasarkan petunjuk di atas, endpoint debug apa yang mungkin
              masih aktif?
            </h3>
            <p className="mb-3 text-xs text-[#8B949E]">
              Ketik path endpoint yang kamu duga masih aktif di production{" "}
              <code className="text-[#F0883E]"></code>
            </p>
            <input
              value={endpointGuess}
              onChange={(e) => setEndpointGuess(e.target.value)}
              placeholder="/debug/..."
              className="w-full rounded border border-[#30363D] bg-[#0D1117] px-3 py-2 font-mono text-sm text-[#E6EDF3] placeholder:text-[#6E7681] focus:border-[#F0883E] focus:outline-none"
            />
          </section>

          <button
            onClick={handleSubmit}
            disabled={submitting || selectedDetailIds.length === 0 || endpointGuess.trim() === ""}
            className="rounded bg-[#238636] px-4 py-2 text-sm font-medium text-white hover:bg-[#238636]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Memeriksa..." : "Submit Jawaban"}
          </button>
        </>
      )}

      {result && feedback && (
        <section
          className={`rounded-md border p-4 text-sm ${
            result.success
              ? "border-[#238636]/40 bg-[#238636]/10 text-[#3FB950]"
              : "border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]"
          }`}
        >
          <p className="font-medium">{feedback.notification_message}</p>
          {feedback.explanation && (
            <p className="mt-2 text-[#C9D1D9]">{feedback.explanation}</p>
          )}

          {!result.success && (
            <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-[#8B949E]">
              {!result.detailIdentification.correct && (
                <li>
                  Identifikasi info bocor belum tepat
                  {result.detailIdentification.missed.length > 0 &&
                    ` (masih ada ${result.detailIdentification.missed.length} detail sensitif yang terlewat)`}
                  {result.detailIdentification.extra.length > 0 &&
                    `, ada ${result.detailIdentification.extra.length} pilihan yang sebenarnya bukan info sensitif`}
                  .
                </li>
              )}
              {!result.endpointGuess.correct && <li>Path endpoint debug belum tepat.</li>}
            </ul>
          )}

          {result.success && feedback.implementation_notes && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs uppercase tracking-wide text-[#8B949E]">
                Lihat contoh perbaikan
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-[#0D1117] p-3 font-mono text-xs text-[#C9D1D9]">
                {feedback.implementation_notes}
              </pre>
            </details>
          )}
        </section>
      )}

      {debugConsoleUnlocked && (
        <section className="rounded-md border border-[#F0883E]/40 bg-[#F0883E]/10 p-4">
          <p className="mb-2 font-mono text-xs uppercase tracking-wider text-[#F0883E]">
            {criteria.hidden_debug_endpoint} &middot; akses diterima
          </p>
          <ul className="list-inside list-disc space-y-1 text-sm text-[#C9D1D9]">
            {criteria.debug_endpoint_exposes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}