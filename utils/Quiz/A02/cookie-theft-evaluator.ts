// Save as: utils/Quiz/A02/lab1/cookie-theft-evaluator.ts

// Mensimulasikan pencurian cookie lewat celah XSS di fitur komentar,
// karena cookie sesi tidak diset dengan atribut HttpOnly. Sama seperti
// lab Stored XSS di A05: payload harus lewat atribut event handler
// (bukan tag <script>) karena sink-nya innerHTML, DAN payload itu harus
// benar-benar membaca document.cookie, bukan sekadar payload XSS generik.

export type CookieTheftCriteria = {
  type: "cookie_theft_via_missing_httponly";
  app_name: string;
  vulnerable_feature: string;
  cookie_name: string;
  cookie_flags_present: string[]; // mis. ["secure", "sameSite"] - httpOnly sengaja tidak ada
  victim_session_active: boolean;
};

export type CookieTheftFailureReason =
  | "no_payload"
  | "script_tag_ignored"
  | "no_cookie_read"
  | "httponly_present"; // untuk robustness kalau criteria di masa depan menyertakan httpOnly

export type CookieTheftAttemptResult = {
  success: boolean;
  reason: CookieTheftFailureReason | "ok";
  stolenCookiePreview?: string;
};

export function evaluateCookieTheftAttempt(
  criteria: CookieTheftCriteria,
  payload: string
): CookieTheftAttemptResult {
  const trimmed = payload.trim();

  if (!trimmed) {
    return { success: false, reason: "no_payload" };
  }

  const httpOnlyAlreadySet = criteria.cookie_flags_present.some(
    (f) => f.toLowerCase() === "httponly"
  );
  if (httpOnlyAlreadySet) {
    return { success: false, reason: "httponly_present" };
  }

  const hasEventHandlerPayload = /<[a-z][a-z0-9]*\b[^>]*\son[a-z]+\s*=/i.test(trimmed);
  const hasScriptTag = /<script[\s>]/i.test(trimmed);
  const readsCookie = /document\.cookie/i.test(trimmed);

  if (!hasEventHandlerPayload && hasScriptTag) {
    return { success: false, reason: "script_tag_ignored" };
  }

  if (!hasEventHandlerPayload) {
    return { success: false, reason: "no_cookie_read" };
  }

  if (!readsCookie) {
    return { success: false, reason: "no_cookie_read" };
  }

  // Buat preview token palsu, bukan data sungguhan apapun.
  const fakeToken = `${criteria.cookie_name}=sess_${Math.random().toString(36).slice(2, 10)}`;
  return { success: true, reason: "ok", stolenCookiePreview: fakeToken };
}