// Aturan auth yang dipakai bersama oleh signup, reset password, dan middleware.
// Murni fungsi (tanpa I/O) dan hanya memakai API standar JS, jadi aman dipakai
// di edge runtime (middleware) maupun server action.

export const MIN_PASSWORD_LENGTH = 8;

// ---- Input ---------------------------------------------------------------

export function normalizeEmail(raw: FormDataEntryValue | null): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Kode OTP sering disalin dengan spasi ("123 456"); buang semua whitespace. */
export function normalizeCode(raw: FormDataEntryValue | null): string {
  return String(raw ?? "").replace(/\s+/g, "");
}

/** Panjang kode di Supabase bisa diatur 6-10 digit, jadi terima rentang itu. */
export function isPlausibleCode(code: string): boolean {
  return /^\d{6,10}$/.test(code);
}

// ---- Password ------------------------------------------------------------

export function validatePasswordLength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`;
  }
  return null;
}

export function validateNewPassword(password: string, confirm: string): string | null {
  const tooShort = validatePasswordLength(password);
  if (tooShort) return tooShort;
  if (password !== confirm) return "Konfirmasi password tidak sama.";
  return null;
}

// ---- Penanda "baru lolos verifikasi kode reset" ---------------------------
//
// Cookie ini diset server action SETELAH verifyOtp berhasil, dan dibutuhkan
// untuk membuka /new-password serta menjalankan aksi updatePassword. Isinya
// "<userId>.<kedaluwarsa dalam ms>", terikat ke user yang sedang login.
//
// Catatan jujur: ini TIDAK ditandatangani, jadi ia membatasi ALUR di aplikasi
// ini, bukan pengaman tingkat API. Siapa pun yang memegang token sesi tetap
// bisa memanggil endpoint Supabase langsung. Kegunaannya: user yang sedang
// login biasa tidak bisa ganti password lewat halaman ini tanpa kode baru.

export const PW_RESET_COOKIE = "pw_reset_ok";
export const PW_RESET_WINDOW_SECONDS = 10 * 60;

export function makeResetCookieValue(userId: string, now: number = Date.now()): string {
  return `${userId}.${now + PW_RESET_WINDOW_SECONDS * 1000}`;
}

export function isResetCookieValid(
  value: string | undefined,
  userId: string,
  now: number = Date.now()
): boolean {
  if (!value) return false;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return false;

  const id = value.slice(0, dot);
  const expiresAt = Number(value.slice(dot + 1));
  if (id !== userId || !Number.isFinite(expiresAt)) return false;

  // Sudah lewat, atau kedaluwarsanya mustahil jauh (nilai yang diakali).
  if (now >= expiresAt) return false;
  if (expiresAt - now > PW_RESET_WINDOW_SECONDS * 1000 + 5000) return false;
  return true;
}