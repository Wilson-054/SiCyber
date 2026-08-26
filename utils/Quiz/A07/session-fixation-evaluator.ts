// Save as: utils/Quiz/A07/lab1/session-fixation-evaluator.ts

// Mensimulasikan alur Session Fixation.
//
// User (berperan sebagai penyerang) mengetik SENDIRI session ID yang
// mau ditanam, lalu "mengirim" itu ke korban sebelum korban login.
// Server dalam simulasi ini TIDAK meregenerasi session ID setelah
// login berhasil (sesuai skenario lab), kecuali criteria mengatakan
// sebaliknya.
//
// Setelah korban "login", user harus MENGAMATI sendiri cookie session
// korban dan MENYIMPULKAN sendiri apakah itu sama dengan yang dia
// tanam di awal, sebelum mencoba akses. Kesimpulan yang salah (atau
// menyerah padahal sebenarnya masih bisa) dihitung sebagai kegagalan
// yang berbeda dari sekadar salah teknis.

export type SessionFixationCriteria = {
  type: "session_fixation_hijack";
  app_name: string;
  victim_username: string;
  session_id_regenerated_after_login: boolean;
};

export type SessionFixationConclusion = "same" | "different";

export type SessionFixationAttemptInput = {
  // session ID yang diketik & di-set attacker SEBELUM korban login
  attackerSessionIdSet: string;
  // apakah korban sudah disimulasikan login
  victimLoggedIn: boolean;
  // cookie session korban SETELAH login, sebagaimana ditampilkan sistem
  // (dihitung di server action, bukan dikirim balik oleh client)
  victimSessionIdAfterLogin: string;
  // kesimpulan yang DIPILIH SENDIRI oleh user setelah membandingkan
  userConclusion: SessionFixationConclusion | null;
  // cookie yang dipakai attacker saat mencoba akses (bisa saja user
  // sudah mengubahnya lagi sebelum tahap ini)
  attackerCheckSessionId: string;
};

export type SessionFixationFailureReason =
  | "session_not_set_before_login"
  | "victim_not_logged_in_yet"
  | "no_conclusion_made"
  | "wrong_conclusion_same"      // user bilang "beda" padahal sebenarnya sama -> harusnya tetap coba akses
  | "wrong_conclusion_different" // user bilang "sama" padahal sebenarnya beda
  | "check_session_mismatch";    // kesimpulan benar tapi cookie saat cek sudah tidak sama lagi

export type SessionFixationAttemptResult = {
  success: boolean;
  reason: SessionFixationFailureReason | "ok";
  victimSessionIdAfterLogin: string;
};

// Menentukan session ID korban setelah login, berdasarkan session ID
// yang ditanam attacker dan apakah server meregenerasi session.
export function computeVictimSessionAfterLogin(
  criteria: SessionFixationCriteria,
  attackerSessionIdSet: string
): string {
  if (!attackerSessionIdSet) return "";
  if (criteria.session_id_regenerated_after_login) {
    // server membuat session ID baru yang acak, tidak sama dengan yang ditanam
    return `SERVER-REGENERATED-${attackerSessionIdSet.length}${attackerSessionIdSet.slice(0, 3)}`;
  }
  return attackerSessionIdSet;
}

export function evaluateSessionFixationAttempt(
  criteria: SessionFixationCriteria,
  input: SessionFixationAttemptInput
): SessionFixationAttemptResult {
  const victimSessionIdAfterLogin = input.victimSessionIdAfterLogin;

  if (!input.attackerSessionIdSet) {
    return { success: false, reason: "session_not_set_before_login", victimSessionIdAfterLogin };
  }
  if (!input.victimLoggedIn) {
    return { success: false, reason: "victim_not_logged_in_yet", victimSessionIdAfterLogin };
  }
  if (!input.userConclusion) {
    return { success: false, reason: "no_conclusion_made", victimSessionIdAfterLogin };
  }

  const actuallySame = victimSessionIdAfterLogin === input.attackerSessionIdSet;

  if (input.userConclusion === "different" ) {
    // user menyerah / menyimpulkan tidak bisa hijack
    if (actuallySame) {
      // padahal sebenarnya sama persis -> kesimpulan salah, serangan sebenarnya jalan
      return { success: false, reason: "wrong_conclusion_same", victimSessionIdAfterLogin };
    }
    // kesimpulan "beda" itu benar (server meregenerasi), tapi karena user
    // memilih untuk tidak melanjutkan, tidak ada hijack untuk dievaluasi
    return { success: false, reason: "wrong_conclusion_same", victimSessionIdAfterLogin };
  }

  // userConclusion === "same"
  if (!actuallySame) {
    return { success: false, reason: "wrong_conclusion_different", victimSessionIdAfterLogin };
  }

  // kesimpulan benar (memang sama) -> lanjut coba akses dengan cookie saat ini
  if (input.attackerCheckSessionId !== victimSessionIdAfterLogin) {
    return { success: false, reason: "check_session_mismatch", victimSessionIdAfterLogin };
  }

  return { success: true, reason: "ok", victimSessionIdAfterLogin };
}