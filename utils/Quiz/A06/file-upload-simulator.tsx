// Save as: utils/Quiz/A06/lab1/file-upload-simulator.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { attemptFileUpload } from "./file-upload-attempts";
import type {
  FileUploadFailureReason,
  UnrestrictedFileUploadCriteria,
} from "./file-upload-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

const FAILURE_HINTS: Record<FileUploadFailureReason, string> = {
  no_filename_entered: "Belum ada file yang dipilih.",
  no_extension_segment:
    "File ini tidak punya ekstensi sama sekali (tidak ada tanda titik pada namanya). Server butuh ekstensi untuk menentukan cara menjalankannya.",
  extension_not_executable:
    "Ekstensi pada nama file ini tidak termasuk yang dijalankan server sebagai program — file akan disimpan, tapi cuma diperlakukan sebagai dokumen biasa.",
};

// data: URI base64 — statis, tidak bisa "kedaluwarsa" seperti blob object URL,
// dan tidak butuh useEffect/cleanup. Isinya hanya teks placeholder, tidak
// pernah ada file yang benar-benar diunggah ke server.
function toDataUrl(content: string): string {
  const base64 =
    typeof window !== "undefined" && typeof window.btoa === "function"
      ? window.btoa(unescape(encodeURIComponent(content)))
      : Buffer.from(content, "utf-8").toString("base64");
  return `data:text/plain;base64,${base64}`;
}

export default function FileUploadSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: UnrestrictedFileUploadCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof attemptFileUpload>> | null>(
    null
  );
  const [visited, setVisited] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const sampleDownloads = useMemo(
    () => criteria.sample_files.map((f) => ({ ...f, url: toDataUrl(f.content) })),
    [criteria.sample_files]
  );

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Hanya nama file yang kita pakai — isi file tidak pernah dibaca.
    setSelectedFilename(file ? file.name : null);
    setLastResult(null);
    setVisited(false);
  };

  const submit = async () => {
    if (!selectedFilename) return;
    setIsPending(true);
    setVisited(false);
    try {
      const result = await attemptFileUpload(categoryId, exerciseId, criteria, selectedFilename);
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

  const wasStored =
    lastResult !== null &&
    lastResult.reason !== "no_filename_entered" &&
    lastResult.reason !== "no_extension_segment";
  const simulatedUrl = selectedFilename ? `/uploads/${selectedFilename}` : null;

  return (
    <div className="mb-6 rounded-md border border-[#21262D] bg-[#161B22] p-6">
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-[#8B949E]">Simulasi — bukan sistem nyata</p>
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">{criteria.app_name} · Unggah Dokumen Klaim</h3>
      <p className="mb-4 text-xs leading-relaxed text-[#8B949E]">{criteria.feature_context}</p>

      <div className="mb-4 rounded border border-[#21262D] bg-[#0D1117] p-3">
        <p className="mb-2 text-xs text-[#8B949E]">
          Belum punya file untuk dicoba? Unduh salah satu contoh ini, lalu—kalau mau—ubah dulu
          namanya sebelum diunggah:
        </p>
        <ul className="space-y-1">
          {sampleDownloads.map((f) => (
            <li key={f.filename}>
              <a
                href={f.url}
                download={f.filename}
                className="font-mono text-xs text-[#F0883E] underline decoration-dotted hover:text-[#F0883E]/80"
              >
                {f.filename}
              </a>
              <span className="ml-2 text-xs text-[#8B949E]">— {f.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mb-2 text-xs text-[#8B949E]">
        Tipe yang ditampilkan di form (hanya dicek di browser):{" "}
        <code className="text-[#F0883E]">
          {criteria.declared_allowed_extensions.map((e) => `.${e}`).join(", ")}
        </code>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFilePicked}
          className="flex-1 rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 text-xs text-[#E6EDF3] file:mr-3 file:rounded file:border-0 file:bg-[#21262D] file:px-3 file:py-1.5 file:text-xs file:text-[#E6EDF3] hover:file:bg-[#21262D]/80"
        />
        <button
          onClick={submit}
          disabled={isPending || !selectedFilename}
          className="rounded bg-[#F0883E] px-4 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
        >
          {isPending ? "Mengunggah…" : "Unggah File"}
        </button>
      </div>
      {selectedFilename && (
        <p className="mt-2 font-mono text-[11px] text-[#8B949E]">
          Dipilih: <span className="text-[#E6EDF3]">{selectedFilename}</span>
        </p>
      )}

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

          {lastResult.reason !== "ok" && (
            <div className="mt-3 rounded bg-[#0D1117] p-3 text-xs text-[#8B949E]">
              {FAILURE_HINTS[lastResult.reason]}
            </div>
          )}

          {wasStored && simulatedUrl && (
            <p className="mt-3 font-mono text-xs text-[#8B949E]">
              File tersimpan di: <span className="text-[#F0883E]">{simulatedUrl}</span>
            </p>
          )}

          {/* Tombol kunjungi URL hanya muncul kalau file berhasil lolos
              sebagai executable — mengunjungi file yang aman tidak
              menunjukkan apa-apa yang relevan untuk lab ini. */}
          {lastResult.success && simulatedUrl && (
            <div className="mt-3">
              <button
                onClick={() => setVisited(true)}
                className="rounded border border-[#21262D] px-3 py-1.5 text-xs text-[#E6EDF3] hover:border-[#F0883E]/50"
              >
                Kunjungi URL file ini
              </button>
            </div>
          )}

          {visited && lastResult.success && simulatedUrl && (
            <div className="mt-3 overflow-hidden rounded-md border border-[#21262D]">
              {/* Mock jendela browser — murni front-end, bukan iframe/network
                  call sungguhan. */}
              <div className="flex items-center gap-2 border-b border-[#21262D] bg-[#21262D] px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#F85149]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#F0883E]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#3FB950]" />
                <div className="ml-2 flex-1 truncate rounded bg-[#0D1117] px-2 py-1 font-mono text-[11px] text-[#8B949E]">
                  {simulatedUrl}
                </div>
              </div>
              <div className="bg-[#0D1117] p-4 font-mono text-xs leading-relaxed">
                <p className="text-[#8B949E]">// {criteria.simulated_outcome.layanan}</p>
                <p className="mt-2 whitespace-pre-wrap text-[#3FB950]">{criteria.simulated_outcome.info}</p>
              </div>
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