// Save as: utils/Quiz/A01/lab3/ssrf-url-import-evaluator.ts

// Mensimulasikan fitur "impor avatar dari URL" yang server-nya fetch
// alamat apapun yang dimasukkan user tanpa validasi tujuan. User
// mengetik URL bebas; sukses kalau hostname URL itu cocok dengan salah
// satu target internal yang didefinisikan di criteria (localhost,
// 127.0.0.1, alamat mirip metadata, dsb).

export type SsrfInternalTarget = {
  host_pattern: string;
  leaked_data: Record<string, string>;
};

export type SsrfUrlImportCriteria = {
  type: "ssrf_url_import_simulation";
  app_name: string;
  feature_context: string;
  internal_targets: SsrfInternalTarget[];
};

export type SsrfUrlImportFailureReason = "no_url_entered" | "invalid_url" | "external_url";

export type SsrfUrlImportAttemptResult = {
  success: boolean;
  reason: SsrfUrlImportFailureReason | "ok";
  matchedHost?: string;
  leakedData?: Record<string, string>;
};

export function evaluateSsrfUrlImportAttempt(
  criteria: SsrfUrlImportCriteria,
  urlInput: string
): SsrfUrlImportAttemptResult {
  const trimmed = urlInput.trim();
  if (!trimmed) {
    return { success: false, reason: "no_url_entered" };
  }

  let parsed: URL;
  try {
    // Kalau user cuma ketik "localhost" tanpa skema, anggap http:// secara
    // implisit supaya tetap bisa di-parse - fitur nyata biasanya juga
    // menambahkan skema default kalau user lupa menulisnya.
    parsed = new URL(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`);
  } catch {
    return { success: false, reason: "invalid_url" };
  }

  const hostname = parsed.hostname.toLowerCase();
  const match = criteria.internal_targets.find(
    (target) => target.host_pattern.toLowerCase() === hostname
  );

  if (!match) {
    return { success: false, reason: "external_url" };
  }

  return { success: true, reason: "ok", matchedHost: match.host_pattern, leakedData: match.leaked_data };
}