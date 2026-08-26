// Save as: utils/Quiz/A10/lab1/error-debug-exposure-evaluator.ts

// Mensimulasikan alur dua tahap dari materi "Error & Debug Exposure"
// (CWE-209 + CWE-489):
//   Tahap 1 - pengguna memilih (multi-select) potongan informasi mana
//     saja pada pesan error mentah yang tergolong bocor/sensitif.
//     Sukses hanya kalau pilihannya PERSIS SAMA dengan seluruh detail
//     yang ditandai sensitive: true - tidak kurang, tidak lebih.
//   Tahap 2 - berbekal petunjuk dari tahap 1, pengguna menebak path
//     endpoint debug tersembunyi yang diisyaratkan pesan error tersebut.
// success = true hanya kalau kedua tahap benar. Pola ini sengaja
// mempertahankan dua sub-hasil terpisah (bukan cuma boolean tunggal)
// supaya UI bisa menampilkan feedback granular per tahap, mengikuti
// pola { success, missed, extra } pada sensitive-field-evaluator.

export type LeakedErrorDetail = {
  id: string;
  label: string;
  sensitive: boolean;
};

export type ErrorDebugExposureCriteria = {
  type: "error_debug_exposure";
  app_name: string;
  trigger_endpoint: string;
  raw_error_message: string;
  leaked_error_details: LeakedErrorDetail[];
  hidden_debug_endpoint: string;
  debug_endpoint_exposes: string[];
};

export type ErrorDebugExposureAttempt = {
  selectedDetailIds: string[];
  debugEndpointGuess: string;
};

export type ErrorDebugExposureResult = {
  success: boolean;
  detailIdentification: {
    correct: boolean;
    missed: string[]; // id detail sensitif yang belum ditandai
    extra: string[]; // id detail aman yang salah ditandai
  };
  endpointGuess: {
    correct: boolean;
  };
};

function normalizePath(path: string): string {
  const trimmed = path.trim().toLowerCase().replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function evaluateErrorDebugExposure(
  criteria: ErrorDebugExposureCriteria,
  attempt: ErrorDebugExposureAttempt
): ErrorDebugExposureResult {
  const selected = new Set(attempt.selectedDetailIds);
  const sensitiveIds = criteria.leaked_error_details
    .filter((d) => d.sensitive)
    .map((d) => d.id);
  const sensitiveSet = new Set(sensitiveIds);

  const missed = sensitiveIds.filter((id) => !selected.has(id));
  const extra = [...selected].filter((id) => !sensitiveSet.has(id));
  const detailCorrect = missed.length === 0 && extra.length === 0;

  const endpointCorrect =
    normalizePath(attempt.debugEndpointGuess) ===
    normalizePath(criteria.hidden_debug_endpoint);

  return {
    success: detailCorrect && endpointCorrect,
    detailIdentification: { correct: detailCorrect, missed, extra },
    endpointGuess: { correct: endpointCorrect },
  };
}
