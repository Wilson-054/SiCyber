// Save as: utils/Quiz/A07/lab2/session-fixation-login-evaluator.ts

// Simulasi WSTG session-fixation test, dengan pengecoh di tiap titik
// keputusan: peserta harus MENGENALI cookie sesi di antara cookie lain
// (bukan langsung diberi tahu), MENYUSUN sendiri link yang menanamkan ID
// itu lewat parameter URL, lalu MEMILIH LAGI cookie yang benar di sisi
// korban. Evaluator memverifikasi setiap langkah, bukan cuma nilai akhir,
// supaya asal klik/tebak di langkah manapun tidak ikut lolos.

export type CookieEntry = { name: string; value: string };

export type SessionFixationLoginCriteria = {
  type: "session_fixation_login";
  app_name: string;
  feature_context: string;
  // Nama cookie yang benar-benar menyimpan ID sesi (mis. "sid").
  session_cookie_name: string;
  // Nama parameter URL yang diterima server untuk menanamkan ID sesi.
  session_url_param: string;
  anonymous_session_id: string;
  // Cookie lain yang tampil berdampingan dengan cookie sesi, sebagai
  // pengecoh (nama & nilainya tidak relevan dengan serangan).
  decoy_cookies: CookieEntry[];
  login_url_path: string;
  accepts_client_supplied_session_id: boolean;
  rotates_session_id_on_login: boolean;
  victim: {
    username: string;
    display_name: string;
    profile_fields: Record<string, string>;
  };
  attack_steps: string[];
  success_when: string;
};

export type SessionFixationLoginFailureReason =
  | "no_cookie_captured"
  | "wrong_cookie_captured"
  | "no_link_entered"
  | "link_missing_param"
  | "link_wrong_value"
  | "no_victim_cookie_selected"
  | "wrong_cookie_reused"
  | "session_id_mismatch";

export type SessionFixationLoginAttemptInput = {
  // Langkah 1: cookie yang peserta klik di cookie jar anonim.
  capturedCookieName: string;
  capturedCookieValue: string;
  // Langkah 2: URL lengkap yang peserta ketik sendiri untuk ditanamkan.
  plantedLinkInput: string;
  // Langkah 4: cookie yang peserta klik di cookie jar korban (setelah login).
  finalCookieName: string;
  finalCookieValue: string;
};

export type SessionFixationLoginAttemptResult = {
  success: boolean;
  reason: SessionFixationLoginFailureReason | "ok";
  leakedProfile?: { display_name: string; fields: Record<string, string> };
};

function extractUrlParamValue(url: string, param: string): string | null {
  const regex = new RegExp(`[?&]${param}=([^&#]*)`, "i");
  const match = url.match(regex);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function evaluateSessionFixationLoginAttempt(
  criteria: SessionFixationLoginCriteria,
  input: SessionFixationLoginAttemptInput
): SessionFixationLoginAttemptResult {
  // --- Langkah 1: apakah peserta mengenali cookie sesi yang benar? -------
  if (!input.capturedCookieName) {
    return { success: false, reason: "no_cookie_captured" };
  }
  if (input.capturedCookieName !== criteria.session_cookie_name) {
    return { success: false, reason: "wrong_cookie_captured" };
  }

  // --- Langkah 2: apakah link yang disusun benar-benar menanamkan nilai --
  // yang sama dengan yang dicatat di langkah 1?
  const trimmedLink = input.plantedLinkInput.trim();
  if (!trimmedLink) {
    return { success: false, reason: "no_link_entered" };
  }
  const linkValue = extractUrlParamValue(trimmedLink, criteria.session_url_param);
  if (linkValue === null) {
    return { success: false, reason: "link_missing_param" };
  }
  if (linkValue !== input.capturedCookieValue) {
    return { success: false, reason: "link_wrong_value" };
  }

  // --- Langkah 4: apakah peserta kembali memilih cookie yang benar di ----
  // sisi korban, dengan nilai yang sama seperti yang ditanamkan?
  if (!input.finalCookieName) {
    return { success: false, reason: "no_victim_cookie_selected" };
  }
  if (input.finalCookieName !== criteria.session_cookie_name) {
    return { success: false, reason: "wrong_cookie_reused" };
  }
  if (input.finalCookieValue !== linkValue) {
    // Konsisten secara struktur tapi nilainya menyimpang (mis. jar korban
    // dibangun dari nilai link yang salah) — tetap gagal di sini.
    return { success: false, reason: "session_id_mismatch" };
  }

  // --- Verifikasi akhir terhadap kebenaran dasar (ground truth) ----------
  if (input.finalCookieValue !== criteria.anonymous_session_id) {
    return { success: false, reason: "session_id_mismatch" };
  }

  return {
    success: true,
    reason: "ok",
    leakedProfile: {
      display_name: criteria.victim.display_name,
      fields: criteria.victim.profile_fields,
    },
  };
}