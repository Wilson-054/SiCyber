// Save as: utils/Quiz/A05/lab2/stored-xss-evaluator.ts

// Mensimulasikan kolom komentar yang render lewat innerHTML tanpa
// encoding. User mengetik komentar bebas; sukses hanya jika payload-nya
// benar-benar akan tereksekusi lewat innerHTML — bukan sekadar
// mengandung tag <script> (yang secara nyata TIDAK dieksekusi browser
// modern ketika disisipkan lewat innerHTML), melainkan lewat atribut
// event handler seperti onerror/onload yang memang terpicu otomatis.

export type StoredXssCriteria = {
  type: "stored_xss_comment_injection";
  app_name: string;
  vulnerable_sink: string;
  target_action: string;
};

export type StoredXssFailureReason = "no_payload" | "script_tag_ignored" | "no_match";

export type StoredXssAttemptResult = {
  success: boolean;
  reason: StoredXssFailureReason | "ok";
};

export function evaluateStoredXssAttempt(
  criteria: StoredXssCriteria,
  comment: string
): StoredXssAttemptResult {
  const trimmed = comment.trim();

  if (!trimmed) {
    return { success: false, reason: "no_payload" };
  }

  // Tag apapun dengan atribut event handler (onerror, onload, dst.)
  // yang otomatis terpicu begitu elemen dimuat/gagal dimuat.
  const hasEventHandlerPayload = /<[a-z][a-z0-9]*\b[^>]*\son[a-z]+\s*=/i.test(trimmed);
  if (hasEventHandlerPayload) {
    return { success: true, reason: "ok" };
  }

  // Tag <script> lewat innerHTML tidak dieksekusi browser modern -
  // ini kesalahpahaman umum yang sengaja dijadikan jebakan edukatif.
  const hasScriptTag = /<script[\s>]/i.test(trimmed);
  if (hasScriptTag) {
    return { success: false, reason: "script_tag_ignored" };
  }

  return { success: false, reason: "no_match" };
}