// Save as: utils/Quiz/A01/lab3/csrf-transfer-evaluator.ts

// User menulis payload HTML bebas. Sukses kalau payload itu punya
// struktur yang benar-benar akan memicu transfer otomatis tanpa
// interaksi korban: form POST ke endpoint transfer, hidden input
// dengan nilai tujuan penyerang & jumlah yang benar, dan trigger
// auto-submit (bukan cuma tombol submit manual, karena korban tidak
// akan pernah sengaja mengklik apapun).

export type CsrfTransferCriteria = {
  type: "csrf_fund_transfer";
  app_name: string;
  victim_session_active: boolean;
  target_account_attacker: string;
  transfer_amount: number;
};

export type CsrfTransferFailureReason =
  | "no_payload"
  | "no_form_to_transfer_endpoint"
  | "wrong_target_account"
  | "wrong_amount"
  | "no_auto_submit";

export type CsrfTransferAttemptResult = {
  success: boolean;
  reason: CsrfTransferFailureReason | "ok";
};

export function evaluateCsrfTransferAttempt(
  criteria: CsrfTransferCriteria,
  payload: string
): CsrfTransferAttemptResult {
  const trimmed = payload.trim();
  if (!trimmed) {
    return { success: false, reason: "no_payload" };
  }

  const hasFormToTransfer = /<form\b[^>]*action\s*=\s*["'][^"']*\/transfer["'][^>]*>/i.test(trimmed);
  if (!hasFormToTransfer) {
    return { success: false, reason: "no_form_to_transfer_endpoint" };
  }

  const toAccountMatch = trimmed.match(
    /<input\b[^>]*name\s*=\s*["']to_account["'][^>]*value\s*=\s*["']([^"']*)["']/i
  );
  if (!toAccountMatch || toAccountMatch[1] !== criteria.target_account_attacker) {
    return { success: false, reason: "wrong_target_account" };
  }

  const amountMatch = trimmed.match(
    /<input\b[^>]*name\s*=\s*["']amount["'][^>]*value\s*=\s*["']([^"']*)["']/i
  );
  if (!amountMatch || Number(amountMatch[1]) !== criteria.transfer_amount) {
    return { success: false, reason: "wrong_amount" };
  }

  // Auto-submit: pemanggilan .submit() lewat script, tanpa memerlukan klik.
  const hasAutoSubmit = /\.submit\s*\(\s*\)/.test(trimmed);
  if (!hasAutoSubmit) {
    return { success: false, reason: "no_auto_submit" };
  }

  return { success: true, reason: "ok" };
}