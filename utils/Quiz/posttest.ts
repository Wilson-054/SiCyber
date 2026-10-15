// Save as: utils/Quiz/posttest.ts (FILE BARU)
//
// Aturan post-test (satu-satunya sumber kebenaran):
//   - Lulus bila skor >= 80%.
//   - Maksimal 3 percobaan aktif. Setiap percobaan "kembali" 24 jam setelah
//     dipakai (sliding window): percobaan yang dibuat dalam 24 jam terakhir
//     dihitung terpakai.
//   - Satu baris quiz_results (kind = 'posttest') = satu percobaan.
//
// File ini tanpa import server/client, aman dipakai di mana saja.

export const POSTTEST_KIND = 'posttest' as const
export const PASSING_RATIO = 0.8
export const MAX_ATTEMPTS = 3
export const ATTEMPT_REGEN_MS = 24 * 60 * 60 * 1000
/** Batas waktu satu percobaan, dihitung sejak tombol Mulai ditekan. */
export const POSTTEST_DURATION_MS = 60 * 60 * 1000
/** Toleransi server untuk keterlambatan jaringan saat auto-submit. */
export const POSTTEST_GRACE_MS = 30 * 1000

export interface AttemptStatus {
  used: number
  remaining: number
  /** ISO string; kapan satu percobaan kembali. Null bila belum ada percobaan terpakai. */
  nextRegenAt: string | null
}

export function isPassing(score: number | null, total: number | null): boolean {
  if (score == null || !total || total <= 0) return false
  return score / total >= PASSING_RATIO
}

/** Skor minimum agar lulus, mis. 8 untuk 10 soal. */
export function passingScore(total: number): number {
  return Math.ceil(total * PASSING_RATIO - 1e-9)
}

export function computeAttemptStatus(
  attemptTimes: string[],
  now: number = Date.now()
): AttemptStatus {
  const active = attemptTimes
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t) && now - t < ATTEMPT_REGEN_MS)
    .sort((a, b) => a - b)

  const remaining = Math.max(0, MAX_ATTEMPTS - active.length)
  // Kapan SATU percobaan kembali: percobaan terpakai yang paling lama
  // (atau yang ke-(n - MAX + 1) bila entah bagaimana n > MAX) lewat 24 jam.
  const nextRegenAt =
    active.length === 0
      ? null
      : new Date(active[Math.max(0, active.length - MAX_ATTEMPTS)] + ATTEMPT_REGEN_MS).toISOString()

  return { used: active.length, remaining, nextRegenAt }
}

export function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}