// Save as: utils/Quiz/A02/xxe/xxe-simulator.tsx
"use client";

import { useState, useTransition } from "react";
import { attemptXxeLocalFileRead } from "./xxe-attmpts";
import type { XxeFailureReason, XxeLocalFileReadCriteria } from "./xxe-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

const MAX_XML_LENGTH = 5000;

const FAILURE_HINTS: Record<XxeFailureReason, string> = {
  no_xml_entered: "Dokumen XML masih kosong.",
  malformed_xml: "Dokumen ini belum terlihat seperti XML yang valid. Pastikan diawali tag pembuka.",
  no_doctype_or_entity:
    "Belum ada DOCTYPE dengan deklarasi <!ENTITY ... SYSTEM \"...\"> di dokumenmu.",
  entity_not_used:
    "Entity sudah dideklarasikan, tapi belum dirujuk (&nama;) di dalam elemen yang direfleksikan kembali oleh server.",
  unsupported_scheme: "Skema URI pada SYSTEM belum didukung di simulasi ini. Coba skema file.",
  file_not_found: "Path yang kamu rujuk tidak ditemukan di server simulasi ini. Coba path lain.",
  non_target_file:
    "Kamu berhasil membuat parser membaca sebuah file — tapi ini bukan file yang jadi target latihan ini. Coba path lain.",
};

export default function XxeSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: XxeLocalFileReadCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  const [xmlInput, setXmlInput] = useState(criteria.default_xml ?? "");
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof attemptXxeLocalFileRead>> | null>(
    null
  );
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const result = await attemptXxeLocalFileRead(categoryId, exerciseId, criteria, xmlInput);
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

  // Entity dideklarasikan & file terbaca, meski bukan file target — tetap
  // tampilkan isinya sebagai sinyal "kamu di jalur yang benar".
  const showRevealedContent =
    lastResult && lastResult.reason !== "ok" && lastResult.revealedContent;

  return (
    <div className="mb-6 rounded-md border border-[#21262D] bg-[#161B22] p-6">
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-[#8B949E]">Simulasi — bukan sistem nyata</p>
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">{criteria.app_name} · Impor Profil</h3>
      <p className="mb-3 text-xs leading-relaxed text-[#8B949E]">{criteria.feature_context}</p>
      <p className="mb-3 text-xs text-[#8B949E]">
        Endpoint: <code className="text-[#F0883E]">{criteria.endpoint}</code>
      </p>

      <textarea
        value={xmlInput}
        onChange={(e) => setXmlInput(e.target.value.slice(0, MAX_XML_LENGTH))}
        rows={10}
        spellCheck={false}
        placeholder="Tulis dokumen XML di sini..."
        className="w-full rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 font-mono text-xs leading-relaxed text-[#E6EDF3] focus:border-[#F0883E]/50 focus:outline-none"
      />
      <div className="mt-1 text-right font-mono text-[10px] text-[#8B949E]">
        {xmlInput.length} / {MAX_XML_LENGTH}
      </div>

      <div className="mt-2 flex justify-end">
        <button
          onClick={submit}
          disabled={isPending || !xmlInput.trim()}
          className="rounded bg-[#F0883E] px-4 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
        >
          {isPending ? "Mengirim…" : "Kirim Dokumen XML"}
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

          {showRevealedContent && (
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded bg-[#0D1117] p-3 font-mono text-xs text-[#8B949E]">
              <span className="text-[#F0883E]">
                &lt;{lastResult.revealedElement}&gt;
              </span>{" "}
              {lastResult.revealedContent}
            </pre>
          )}

          {lastResult.success && lastResult.revealedContent && (
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded bg-[#0D1117] p-3 font-mono text-xs text-[#8B949E]">
              <span className="text-[#F0883E]">
                &lt;{lastResult.revealedElement}&gt;
              </span>{" "}
              {lastResult.revealedContent}
            </pre>
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