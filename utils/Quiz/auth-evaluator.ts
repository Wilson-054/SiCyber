// Save as: utils/Quiz/auth-evaluator.ts

// Mensimulasikan sistem yang membuat session token dari pola yang bisa
// ditebak (mis. base64 dari "userId:timestamp" tanpa randomness kriptografis)
// alih-alih token acak yang aman. Peserta diberi satu token contoh milik
// user lain, lalu diminta menebak/membangun token session untuk user target.
// Ini simulasi murni di memori — tidak ada session nyata yang dibajak.

export type AuthWeakTokenCriteria = {
  type: "auth_predictable_session";
  app_name: string;
  target_user_id: string;     // user yang mau "dibajak" sesinya
  token_prefix: string;       // mis. "sess_"
  encode: (userId: string) => string; // dijalankan di server action, tidak dikirim ke klien
};

// Karena fungsi tidak bisa disimpan sebagai jsonb, kita definisikan encode-nya
// langsung di server action (lihat auth-attempts.ts), bukan di criteria yang
// datang dari DB. success_criteria dari DB hanya berisi data serializable:
export type AuthWeakTokenDbCriteria = {
  type: "auth_predictable_session";
  app_name: string;
  target_user_id: string;
  token_prefix: string;
};

export type AuthAttemptResult = {
  success: boolean;
  reason: "token_match" | "token_mismatch";
  expectedTokenHint?: string;
};

function buildPredictableToken(prefix: string, userId: string): string {
  // Pola lemah: cuma base64 dari "userId:role", tanpa random/secret apa pun —
  // siapa pun yang tahu pola ini bisa membangun token user lain.
  const payload = Buffer.from(`${userId}:role=user`).toString("base64");
  return `${prefix}${payload}`;
}

export function evaluateAuthTokenGuess(
  criteria: AuthWeakTokenDbCriteria,
  guessedToken: string
): AuthAttemptResult {
  const expected = buildPredictableToken(criteria.token_prefix, criteria.target_user_id);

  if (guessedToken.trim() === expected) {
    return { success: true, reason: "token_match" };
  }
  return { success: false, reason: "token_mismatch", expectedTokenHint: `${criteria.token_prefix}...` };
}