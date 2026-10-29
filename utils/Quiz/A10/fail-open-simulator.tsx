// Save as: utils/Quiz/A10/lab1/fail-open-simulator.tsx
"use client";

import { useState } from "react";
import { attemptFailOpenAccess } from "./fail-open-attempts";
import type {
  FailOpenAuthzCriteria,
  FailOpenFailureReason,
} from "./fail-open-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

const FAILURE_HINTS: Record<FailOpenFailureReason, string> = {
  no_id_entered: "Kolom ID dokumen masih kosong.",
  document_not_found: "Tidak ada dokumen yang cocok dengan ID itu, bahkan setelah mengabaikan huruf besar/kecil dan spasi.",
  normal_allowed_access:
    "Dokumen ini memang boleh kamu akses secara sah — ini bukan bypass. Coba dokumen yang berlabel 🔒 (ditolak).",
  normal_denied_access:
    "Layanan otorisasi berhasil memproses ID ini dan dengan tegas menolak. Belum ada yang error di sini. Coba ubah sedikit BENTUK ID-nya (bukan isinya) dan kirim lagi.",
  disrupted_allowed_trivial:
    "Kamu berhasil membuat layanan otorisasi error, tapi dokumen ini memang sudah boleh kamu akses secara sah — jadi ini bukan demonstrasi bypass yang berarti. Coba pakai trik yang sama pada dokumen yang berlabel 🔒.",
};

export default function FailOpenSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: FailOpenAuthzCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  const [documentId, setDocumentId] = useState("");
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof attemptFailOpenAccess>> | null>(
    null
  );
  const [isPending, setIsPending] = useState(false);

  const submit = async () => {
    setIsPending(true);
    try {
      const result = await attemptFailOpenAccess(categoryId, exerciseId, criteria, documentId);
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

  const decisionColor = lastResult?.appDecision === "granted" ? "text-[#3FB950]" : "text-[#F85149]";

  return (
    <div className="mb-6 rounded-md border border-[#21262D] bg-[#161B22] p-6">
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-[#8B949E]">Simulasi — bukan sistem nyata</p>
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">{criteria.app_name} · Pembuka Dokumen</h3>
      <p className="mb-3 text-xs leading-relaxed text-[#8B949E]">{criteria.feature_context}</p>
      <p className="mb-4 text-xs text-[#8B949E]">
        Endpoint: <code className="text-[#F0883E]">{criteria.endpoint}</code> · Login sebagai:{" "}
        <code className="text-[#F0883E]">{criteria.logged_in_as}</code>
      </p>

      <div className="mb-4 rounded border border-[#21262D] bg-[#0D1117] p-3">
        <p className="mb-2 text-xs text-[#8B949E]">Daftar dokumen di sistem:</p>
        <ul className="space-y-1">
          {criteria.documents.map((d) => (
            <li key={d.id} className="font-mono text-xs">
              <code className="text-[#F0883E]">{d.id}</code>
              <span className="ml-2 text-[#E6EDF3]">{d.title}</span>
              <span className={`ml-2 ${d.authz_result === "denied" ? "text-[#F85149]" : "text-[#3FB950]"}`}>
                {d.authz_result === "denied" ? "🔒 butuh izin admin" : "boleh diakses"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-2">
        <input
          value={documentId}
          onChange={(e) => setDocumentId(e.target.value)}
          placeholder="ID dokumen..."
          spellCheck={false}
          className="flex-1 rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 font-mono text-sm text-[#E6EDF3] focus:border-[#F0883E]/50 focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={isPending || !documentId.trim()}
          className="rounded bg-[#F0883E] px-4 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
        >
          {isPending ? "Membuka…" : "Buka Dokumen"}
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

          {/* Banner error yang mencolok, terpisah dari status ALLOW/DENY
              biasa, supaya inti pembelajarannya (error diperlakukan
              sebagai izin) kelihatan jelas. */}
          {lastResult.serviceErrored && (
            <div className="mt-3 rounded-md border border-[#F0883E]/50 bg-[#F0883E]/10 p-3">
              <p className="font-mono text-xs font-medium text-[#F0883E]">
                ⚠️ Layanan otorisasi gagal memproses permintaan ini (internal error)
              </p>
              <p className="mt-1 text-xs text-[#C9D1D9]">
                Bentuk ID yang kamu kirim tidak dikenali layanan otorisasi, sehingga ia tidak sempat menjawab
                ALLOW maupun DENY. Karena aplikasi ini <strong>fail-open</strong>, kegagalan itu tetap
                diperlakukan sebagai izin diberikan.
              </p>
            </div>
          )}

          {lastResult.authzStatus !== null && (
            <div className="mt-3 rounded bg-[#0D1117] p-3 font-mono text-xs">
              <p className="text-[#8B949E]">
                Keputusan aplikasi:{" "}
                <span className={decisionColor}>
                  {lastResult.appDecision === "granted" ? "AKSES DIBERIKAN" : "AKSES DITOLAK"}
                </span>
              </p>
            </div>
          )}

          {lastResult.reason !== "ok" && (
            <div className="mt-3 rounded bg-[#0D1117] p-3 text-xs text-[#8B949E]">
              {FAILURE_HINTS[lastResult.reason as FailOpenFailureReason]}
            </div>
          )}

          {lastResult.documentTitle && (
            <div className="mt-3 rounded bg-[#0D1117] p-3 font-mono text-xs text-[#8B949E]">
              <p>
                <span className="text-[#F0883E]">judul</span>: {lastResult.documentTitle}
              </p>
              {lastResult.documentContent && (
                <p className="mt-1">
                  <span className="text-[#F0883E]">isi</span>: {lastResult.documentContent}
                </p>
              )}
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